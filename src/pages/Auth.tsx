import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { trackEvent, identifyUser } from '@/utils/analytics';
import { EVENTS } from '@/analytics/events';
import { generateTwoFactorSecret, verifyTwoFactorToken } from '@/lib/totp';
import TwoFactorSetup from '@/components/auth/TwoFactorSetup';
import TwoFactorVerify from '@/components/auth/TwoFactorVerify';

interface AuthProps {
  onAuthSuccess: () => void;
  onBack: () => void;
  initialMode?: 'signin' | 'signup';
}

interface StoredUser {
  id: string;
  fullName: string;
  businessName: string;
  email: string;
  password: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
}

export default function Auth({ onAuthSuccess, initialMode = 'signin' }: AuthProps) {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>(
    searchParams.get('mode') === 'signup' ? 'signup' : initialMode
  );
  const [form, setForm] = useState({ fullName: '', businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Two-factor auth flow state
  const [step, setStep] = useState<'form' | '2fa-setup' | '2fa-verify'>('form');
  const [pendingUser, setPendingUser] = useState<StoredUser | null>(null);
  const [isNewSignup, setIsNewSignup] = useState(false);
  const [twoFactorData, setTwoFactorData] = useState<{ secret: string; otpAuthUrl: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      // Validation
      if (!form.fullName.trim()) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signup',
          reason: 'missing_full_name',
        });
        return setError('Full name is required.');
      }

      if (!form.businessName.trim()) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signup',
          reason: 'missing_business_name',
        });
        return setError('Business name is required.');
      }

      if (!form.email.trim()) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signup',
          reason: 'missing_email',
        });
        return setError('Email is required.');
      }

      if (form.password.length < 6) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signup',
          reason: 'password_too_short',
        });
        return setError('Password must be at least 6 characters.');
      }

      // Check if email already exists
      const existing = localStorage.getItem('invoicepro_user');
      if (existing) {
        const user = JSON.parse(existing);
        if (user.email === form.email) {
          trackEvent(EVENTS.AUTH_FAILED, {
            mode: 'signup',
            reason: 'email_already_exists',
            email: form.email,
          });
          return setError('An account with this email already exists.');
        }
      }

      const userId = crypto.randomUUID();
      const { base32Secret, otpAuthUrl } = generateTwoFactorSecret(form.email);

      const newUser: StoredUser = {
        id: userId,
        fullName: form.fullName,
        businessName: form.businessName,
        email: form.email,
        password: form.password,
        twoFactorSecret: base32Secret,
        twoFactorEnabled: false,
      };

      // Save user (2FA is confirmed, not yet enabled, until setup is completed below)
      localStorage.setItem('invoicepro_user', JSON.stringify(newUser));

      // Pre-fill business info
      localStorage.setItem(
        'invoicepro_business',
        JSON.stringify({
          name: form.businessName,
          address: '',
          phone: '',
          email: form.email,
        })
      );

      // Send to Formspree
      await fetch('https://formspree.io/f/meepdlzy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          businessName: form.businessName,
          email: form.email,
        }),
      });

      // Track successful signup (session/2FA_setup_completed still pending)
      trackEvent(EVENTS.SIGNUP_COMPLETED, {
        user_id: userId,
        email: form.email,
        business_name: form.businessName,
        auth_method: 'local_storage',
      });

      trackEvent(EVENTS.TWO_FA_SETUP_STARTED, {
        user_id: userId,
        email: form.email,
      });

      setPendingUser(newUser);
      setIsNewSignup(true);
      setTwoFactorData({ secret: base32Secret, otpAuthUrl });
      setStep('2fa-setup');
    } else {
      // Sign in
      if (!form.email.trim() || !form.password.trim()) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signin',
          reason: 'missing_email_or_password',
        });
        return setError('Email and password are required.');
      }

      const existing = localStorage.getItem('invoicepro_user');
      if (!existing) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signin',
          reason: 'no_account_found',
          email: form.email,
        });
        return setError('No account found. Please sign up first.');
      }

      const user: StoredUser = JSON.parse(existing);
      if (user.email !== form.email || user.password !== form.password) {
        trackEvent(EVENTS.AUTH_FAILED, {
          mode: 'signin',
          reason: 'invalid_credentials',
          email: form.email,
        });
        return setError('Incorrect email or password.');
      }

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        trackEvent(EVENTS.TWO_FA_VERIFY_PROMPTED, {
          user_id: user.id || user.email,
          email: user.email,
          context: 'signin',
        });

        setPendingUser(user);
        setIsNewSignup(false);
        setStep('2fa-verify');
        return;
      }

      completeSignIn(user);
    }
  };

  const completeSignIn = (user: StoredUser) => {
    localStorage.setItem('invoicepro_session', 'true');

    identifyUser(user.id || user.email, {
      email: user.email,
      full_name: user.fullName,
      business_name: user.businessName,
      auth_method: 'local_storage',
    });

    trackEvent(EVENTS.SIGNIN_COMPLETED, {
      user_id: user.id || user.email,
      email: user.email,
      auth_method: 'local_storage',
    });

    onAuthSuccess();
  };

  const handleTwoFactorSetupContinue = () => {
    setStep('2fa-verify');
  };

  const handleTwoFactorVerify = (code: string) => {
    if (!pendingUser?.twoFactorSecret) return false;
    const isValid = verifyTwoFactorToken(pendingUser.twoFactorSecret, code);

    trackEvent(isValid ? EVENTS.TWO_FA_VERIFY_SUCCEEDED : EVENTS.TWO_FA_VERIFY_FAILED, {
      user_id: pendingUser.id || pendingUser.email,
      email: pendingUser.email,
      context: isNewSignup ? 'setup' : 'signin',
    });

    return isValid;
  };

  const handleTwoFactorVerifySuccess = () => {
    if (!pendingUser) return;

    if (isNewSignup) {
      const confirmedUser: StoredUser = { ...pendingUser, twoFactorEnabled: true };
      localStorage.setItem('invoicepro_user', JSON.stringify(confirmedUser));

      trackEvent(EVENTS.TWO_FA_SETUP_COMPLETED, {
        user_id: confirmedUser.id,
        email: confirmedUser.email,
      });

      completeSignIn(confirmedUser);
    } else {
      completeSignIn(pendingUser);
    }

    setStep('form');
    setPendingUser(null);
    setTwoFactorData(null);
  };

  const handleTwoFactorCancel = () => {
    trackEvent(EVENTS.TWO_FA_CANCELLED, {
      user_id: pendingUser?.id,
      email: pendingUser?.email,
      context: isNewSignup ? 'setup' : 'signin',
    });

    if (isNewSignup) {
      // Discard the unconfirmed account so the user can retry signup cleanly
      localStorage.removeItem('invoicepro_user');
    }

    setStep('form');
    setPendingUser(null);
    setTwoFactorData(null);
    setIsNewSignup(false);
  };

  if (step === '2fa-setup' && twoFactorData) {
    return (
      <TwoFactorSetup
        otpAuthUrl={twoFactorData.otpAuthUrl}
        secret={twoFactorData.secret}
        onContinue={handleTwoFactorSetupContinue}
        onCancel={handleTwoFactorCancel}
      />
    );
  }

  if (step === '2fa-verify') {
    return (
      <TwoFactorVerify
        title={isNewSignup ? 'Confirm your authenticator' : 'Enter verification code'}
        description={
          isNewSignup
            ? 'Enter the 6-digit code from your authenticator app to finish setting up 2FA.'
            : 'Enter the 6-digit code from your authenticator app to sign in.'
        }
        onVerify={handleTwoFactorVerify}
        onSuccess={handleTwoFactorVerifySuccess}
        onCancel={handleTwoFactorCancel}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white border rounded-2xl shadow-sm w-full max-w-md p-8">
          {/* Toggle tabs */}
          <div className="flex rounded-xl border overflow-hidden mb-8">
            <button
              onClick={() => { setMode('signin'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                mode === 'signin'
                  ? 'bg-emerald-500 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-emerald-500 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Sign Up
            </button>
          </div>

          <h2 className="text-2xl font-bold mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {mode === 'signin'
              ? 'Sign in to access your dashboard.'
              : 'Get started for free today.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    name="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={form.fullName}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                  <input
                    name="businessName"
                    type="text"
                    placeholder="My Business Ltd"
                    value={form.businessName}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 px-4 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-semibold text-sm mt-2"
            >
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError('');
              }}
              className="text-emerald-600 font-semibold hover:underline"
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}