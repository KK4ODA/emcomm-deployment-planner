import React from 'react';
import { useOffline } from './OfflineProvider';
import { WifiOff, Wifi, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function OfflineIndicator() {
  const { isOnline, syncState, syncNow } = useOffline();

  if (isOnline && !syncState.syncing && !syncState.error) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
      >
        <div className={`
          flex items-center gap-3 px-4 py-3 rounded-full shadow-lg border
          ${!isOnline ? 'bg-amber-50 border-amber-200' : 
            syncState.syncing ? 'bg-blue-50 border-blue-200' : 
            syncState.error ? 'bg-rose-50 border-rose-200' : 
            'bg-green-50 border-green-200'}
        `}>
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900">
                You're offline - changes will sync when reconnected
              </span>
            </>
          ) : syncState.syncing ? (
            <>
              <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-blue-900">
                Syncing data...
              </span>
            </>
          ) : syncState.error ? (
            <>
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span className="text-sm font-medium text-rose-900">
                Sync failed - {syncState.error}
              </span>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={syncNow}
                className="h-7 text-xs"
              >
                Retry
              </Button>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-900">
                Synced successfully
              </span>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}