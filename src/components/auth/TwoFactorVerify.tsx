import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

interface TwoFactorVerifyProps {
  title?: string;
  description?: string;
  onVerify: (code: string) => boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function TwoFactorVerify({
  title = 'Enter verification code',
  description = 'Enter the 6-digit code from your authenticator app.',
  onVerify,
  onSuccess,
  onCancel,
}: TwoFactorVerifyProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleChange = (value: string) => {
    setCode(value);
    setError('');

    if (value.length === 6) {
      setChecking(true);
      const isValid = onVerify(value);
      setChecking(false);

      if (isValid) {
        onSuccess();
      } else {
        setError('Invalid code. Please try again.');
        setCode('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white border rounded-2xl shadow-sm w-full max-w-md p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-emerald-600" />
          </div>

          <h2 className="text-2xl font-bold mb-1 text-center">{title}</h2>
          <p className="text-slate-500 text-sm mb-8 text-center">{description}</p>

          <div className="flex justify-center mb-6">
            <InputOTP maxLength={6} value={code} onChange={handleChange} disabled={checking}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 px-4 py-2 rounded-lg text-center mb-4">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="w-full text-slate-500 hover:text-slate-700 text-sm"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
