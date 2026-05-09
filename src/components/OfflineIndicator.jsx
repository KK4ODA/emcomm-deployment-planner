import React from 'react';
import { useOffline } from './OfflineProvider';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineIndicator() {
  const { isOnline } = useOffline();

  if (isOnline) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-full shadow-lg border bg-amber-50 border-amber-200">
          <WifiOff className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-900">
            You're offline — changes will sync when reconnected
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
