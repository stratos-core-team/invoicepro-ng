import { Settings, Receipt, LogOut, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resetUser } from '@/utils/analytics';

interface HeaderProps {
  businessName: string;
  onSettings: () => void;
  onLogout: () => void;
  onUpgrade: () => void;
  isPro?: boolean;
}

export function Header({ businessName, onSettings, onLogout, onUpgrade, isPro = false }: HeaderProps) {
  const handleLogout = () => {
    // Clear the PostHog identity first, then run the existing logout logic from the parent
    resetUser();
    onLogout();
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-emerald-800 text-sm leading-tight">InvoicePro NG</h1>
            <p className="text-xs text-gray-500 truncate max-w-[120px]">{businessName}</p>
          </div>
        </div>
        {!isPro && (
          <button
            onClick={onUpgrade}
            className="hidden md:flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Upgrade to Pro
          </button>
        )}
        {isPro && (
          <span className="hidden md:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
            <Crown className="w-3.5 h-3.5" />
            Pro
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-gray-600 hover:text-emerald-700"
        >
          <Settings className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-gray-600 hover:text-red-500"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}