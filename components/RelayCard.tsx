import React from 'react';
import { Lightbulb, DoorOpen, ToggleLeft, ToggleRight, Zap, Info, EyeOff, Eye } from 'lucide-react';
import { Relay, RelayType } from '../types';

interface RelayCardProps {
  relay: Relay;
  onToggle: (id: number) => void;
  isEditing?: boolean;
  nameValue?: string;
  onNameChange?: (id: number, name: string) => void;
  onNameSave?: (id: number) => void;
  onToggleVisibility?: (id: number) => void;
  isHidden?: boolean;
  onIconChange?: (id: number, iconType: RelayType) => void;
  isDisabled?: boolean;
}

const iconOptions: { key: RelayType; icon: React.ReactNode }[] = [
  { key: RelayType.LIGHT, icon: <Lightbulb className="w-5 h-5" /> },
  { key: RelayType.DOOR, icon: <DoorOpen className="w-5 h-5" /> },
  { key: RelayType.SIGN, icon: <Info className="w-5 h-5" /> },
  { key: RelayType.MACHINE, icon: <Zap className="w-5 h-5" /> },
];

const RelayCard: React.FC<RelayCardProps> = ({ relay, onToggle, isEditing = false, nameValue, onNameChange, onNameSave, onToggleVisibility, isHidden, onIconChange, isDisabled }) => {
  const getIcon = () => {
    const iconKind = relay.iconType || relay.type;
    switch (iconKind) {
      case RelayType.LIGHT: return <Lightbulb className={`w-6 h-6 ${relay.isOn ? 'text-yellow-400' : 'text-slate-400'}`} />;
      case RelayType.DOOR: return <DoorOpen className={`w-6 h-6 ${relay.isOn ? 'text-emerald-400' : 'text-slate-400'}`} />;
      case RelayType.SIGN: return <Info className={`w-6 h-6 ${relay.isOn ? 'text-pink-400' : 'text-slate-400'}`} />;
      default: return <Zap className={`w-6 h-6 ${relay.isOn ? 'text-blue-400' : 'text-slate-400'}`} />;
    }
  };

  const channelLabel = typeof relay.channelNumber === 'number'
    ? (relay.channelNumber === 0 ? 'N/A' : relay.channelNumber)
    : 'N/A';

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${isDisabled ? 'opacity-50 pointer-events-none' : ''} ${
      relay.isOn 
        ? 'bg-slate-800 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
        : 'bg-slate-800/50 border-slate-700'
    }`}>
      <div className="flex justify-between items-start mb-2 opacity-100">
        <div className={`p-2 rounded-lg ${relay.isOn ? 'bg-indigo-500/10' : 'bg-slate-700/30'}`}>
          {getIcon()}
        </div>
        {!isEditing && (
          <button
            onClick={() => onToggle(relay.id)}
            className="focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full"
            disabled={relay.isLocked || isDisabled}
          >
            {relay.isOn ? (
              <ToggleRight className="w-10 h-10 text-indigo-500 transition-colors" />
            ) : (
              <ToggleLeft className="w-10 h-10 text-slate-500 transition-colors" />
            )}
          </button>
        )}
      </div>
      
      <div>
        {isEditing ? (
          <div className="space-y-2">
            <input
              value={nameValue ?? relay.name}
              onChange={e => onNameChange?.(relay.id, e.target.value)}
              onBlur={() => onNameSave?.(relay.id)}
              disabled={isDisabled}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
            />
            <div className="flex gap-2">
              <div className="flex-1 grid grid-cols-2 gap-1 text-[11px]">
                {iconOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => onIconChange?.(relay.id, opt.key)}
                    disabled={isDisabled}
                    className={`px-2 py-1 rounded-md border flex items-center justify-center ${
                      (relay.iconType || relay.type) === opt.key ? 'border-indigo-500 text-indigo-200 bg-indigo-500/10' : 'border-slate-700 text-slate-300 hover:border-indigo-500'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onToggleVisibility?.(relay.id)}
                disabled={isDisabled}
                className={`w-10 h-9 flex items-center justify-center rounded-md border transition-colors ${
                  isHidden ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-emerald-600 text-emerald-200 bg-emerald-500/10'
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isHidden ? 'Show in dashboard' : 'Hide from dashboard'}
              >
                {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-slate-100">{relay.name}</h3>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${relay.isOn ? 'bg-green-500' : 'bg-red-500'}`}></span>
              Channel {channelLabel}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RelayCard;
