import React from 'react';
import { LayoutDashboard, CalendarClock, Settings, Coins, Package } from 'lucide-react';
import type { UiUser } from '../types';

enum Tab {
  DASHBOARD = 'DASHBOARD',
  SCHEDULE = 'SCHEDULE',
  REVENUE = 'REVENUE',
  INVENTORY = 'INVENTORY',
  SETTINGS = 'SETTINGS'
}

interface BottomNavigationProps {
  activeTab: Tab;
  authUser: UiUser | null;
  setActiveTab: (tab: Tab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  authUser,
  setActiveTab,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe">
      <div className="max-w-full sm:max-w-3xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
        {/* Finance - show for admin and viewer */}
        {(authUser?.role === 'admin' || authUser?.role === 'viewer') && (
          <button
            onClick={() => setActiveTab(Tab.REVENUE)}
            className={`flex flex-col items-center gap-1 ${activeTab === Tab.REVENUE ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Coins className="w-6 h-6" />
            <span className="text-[10px] font-medium">Finance</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab(Tab.INVENTORY)}
          className={`flex flex-col items-center gap-1 ${activeTab === Tab.INVENTORY ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Package className="w-6 h-6" />
          <span className="text-[10px] font-medium">Inventory</span>
        </button>

        <button
          onClick={() => setActiveTab(Tab.DASHBOARD)}
          className={`flex flex-col items-center gap-1 ${activeTab === Tab.DASHBOARD ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab(Tab.SCHEDULE)}
          className={`flex flex-col items-center gap-1 ${activeTab === Tab.SCHEDULE ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <CalendarClock className="w-6 h-6" />
          <span className="text-[10px] font-medium">Groups</span>
        </button>

        {/* Settings - hide from viewers */}
        {authUser?.role !== 'viewer' && (
          <button
            onClick={() => setActiveTab(Tab.SETTINGS)}
            className={`flex flex-col items-center gap-1 ${activeTab === Tab.SETTINGS ? 'text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-medium">System</span>
          </button>
        )}
      </div>
    </nav>
  );
};

// Export Tab enum for use in parent component
export { Tab };
