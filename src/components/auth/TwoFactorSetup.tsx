import { useState } from 'react';
import { Copy, Check, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface TwoFactorSetupProps {
  otpAuthUrl: string;
  secret: string;
  onContinue: () => void;
  onCancel: () => void;
}

export default function TwoFactorSetup({ otpAuthUrl, secret, onContinue, onCancel }: TwoFactorSetupProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white border rounded-2xl shadow-sm w-full max-w-md p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mx-auto mb-4">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>

          <h2 className="text-2xl font-bold mb-1 text-center">Set up two-factor authentication</h2>
          <p className="text-slate-500 text-sm mb-6 text-center">
            Scan this QR code with an authenticator app like Google Authenticator, Authy, or 1Password.
          </p>

          <div className="flex justify-center mb-6">
            <div className="p-4 bg-white border rounded-xl">
              <QRCodeSVG value={otpAuthUrl} size={200} />
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center mb-2">Can't scan? Enter this code manually:</p>
          <div className="flex items-center gap-2 mb-8">
            <code className="flex-1 text-sm font-mono bg-slate-100 border rounded-lg px-4 py-2.5 tracking-wider text-center break-all">
              {secret}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 w-10 h-10 flex items-center justify-center border rounded-lg text-slate-500 hover:bg-slate-50"
              aria-label="Copy secret key"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-semibold text-sm"
          >
            I've scanned the code
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full text-slate-500 hover:text-slate-700 text-sm mt-4"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
