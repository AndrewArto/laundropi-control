import React from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import type { Laundry, UiUser, DetergentType, InventoryItem } from '../types';

declare const __APP_VERSION__: string;
declare const __APP_BUILD_DATE__: string;

interface HeaderProps {
  brandLogoUrl: string;
  laundries: Laundry[];
  isLaundryOnline: (laundry: Laundry) => boolean;
  authUser: UiUser | null;
  currentTime: Date;
  handleLogout: () => void;
  inventory?: Map<string, Map<DetergentType, InventoryItem>>;
}

const LOW_STOCK_THRESHOLD = 5;

export const Header: React.FC<HeaderProps> = ({
  brandLogoUrl,
  laundries,
  isLaundryOnline,
  authUser,
  currentTime,
  handleLogout,
  inventory,
}) => {
  const hasLowStock = (laundryId: string): boolean => {
    if (!inventory) return false;
    const agentInventory = inventory.get(laundryId);
    if (!agentInventory) return false;

    const detergentTypes: DetergentType[] = ['blue', 'green', 'brown'];
    return detergentTypes.some(type => {
      const item = agentInventory.get(type);
      return item && item.quantity < LOW_STOCK_THRESHOLD;
    });
  };
  return (
    <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800 overflow-hidden">
      <div className="max-w-full sm:max-w-3xl mx-auto px-3 sm:px-4">
        <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 sm:gap-5 h-20 sm:h-24 lg:h-28">
          <div className="flex items-center h-full">
            <img
              src={brandLogoUrl}
              alt="WashControl"
              className="h-[68%] sm:h-[72%] lg:h-[74%] w-auto shrink-0 object-contain max-w-[150px] sm:max-w-[190px] lg:max-w-[215px]"
              width={135}
              height={78}
            />
            <span className="sr-only">WashControl</span>
            <span className="text-[9px] text-slate-600 ml-1 self-end mb-1 hidden sm:inline">
              {__APP_VERSION__} · {__APP_BUILD_DATE__}
            </span>
          </div>
          <div className="flex items-center justify-center min-w-0">
            {laundries.length > 0 && (
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto min-w-0">
                {laundries.map(laundry => {
                  const online = isLaundryOnline(laundry);
                  const lowStock = hasLowStock(laundry.id);
                  return (
                    <span
                      key={`header-status-${laundry.id}`}
                      className={`inline-flex flex-col gap-1 px-2.5 py-1 rounded-xl border text-[10px] sm:px-3 sm:py-1.5 sm:text-[11px] font-semibold ${
                        online
                          ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10'
                          : 'border-red-400/60 text-red-200 bg-red-500/10'
                      }`}
                    >
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="max-w-[120px] sm:max-w-[140px] truncate">{laundry.name}</span>
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wide opacity-70">
                          {online ? 'Online' : 'Offline'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] uppercase tracking-wide border ${
                            laundry.isMock
                              ? 'border-amber-400/60 text-amber-200 bg-amber-500/10'
                              : 'border-sky-400/60 text-sky-200 bg-sky-500/10'
                          }`}
                        >
                          {laundry.isMock ? 'Mock' : 'Pi'}
                        </span>
                        {lowStock && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] border border-amber-400/60 text-amber-200 bg-amber-500/10">
                            <AlertTriangle className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex h-full flex-col items-end justify-center gap-2 sm:gap-2.5">
            <div className="flex items-center gap-2 sm:gap-3">
              {authUser && (
                <div className="text-right leading-tight">
                  <div className="text-[11px] sm:text-xs text-slate-300">{authUser.username}</div>
                  <div className="text-[9px] sm:text-[10px] uppercase text-slate-500">{authUser.role}</div>
                </div>
              )}
              <div className="text-right leading-tight">
                <div className="text-base sm:text-lg font-mono text-white font-medium">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500">
                  {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold border border-slate-700 rounded-md text-slate-300 hover:text-white hover:border-indigo-500 transition-colors"
            >
              <Lock className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
