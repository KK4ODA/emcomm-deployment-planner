import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { X, Cookie } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setIsVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('cookieConsent', 'dismissed');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-slate-200 shadow-lg"
        >
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie className="h-5 w-5 text-slate-600 mt-0.5" />
              <div>
                <p className="text-sm text-slate-700">
                  We use cookies to enhance your experience, store your preferences, and enable offline functionality. 
                  By continuing to use this site, you consent to our use of cookies.
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                onClick={handleAccept}
                className="bg-slate-900 hover:bg-slate-800 flex-1 sm:flex-none"
              >
                Accept
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}