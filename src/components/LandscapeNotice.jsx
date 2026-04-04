import React, { useState, useEffect } from 'react';
import { RotateCw, X } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function LandscapeNotice() {
  const [isPortrait, setIsPortrait] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
      setIsPortrait(portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
      <div className="bg-slate-900 text-white rounded-lg p-4 shadow-2xl border border-slate-700 flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg">
          <RotateCw className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm mb-1">Rotate for Better View</p>
          <p className="text-xs text-slate-300">Turn your device to landscape mode for the best experience</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}