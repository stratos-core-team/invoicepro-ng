import * as OTPAuth from 'otpauth';

const ISSUER = 'InvoicePro NG';

export function generateTwoFactorSecret(accountEmail: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  return {
    base32Secret: secret.base32,
    otpAuthUrl: totp.toString(),
  };
}

export function verifyTwoFactorToken(base32Secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });

  // Allow the previous/next 30s window to tolerate clock drift
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
