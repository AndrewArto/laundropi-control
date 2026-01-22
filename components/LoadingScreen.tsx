import React from 'react';

interface LoadingScreenProps {
  message: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">
      {message}
    </div>
  );
};
