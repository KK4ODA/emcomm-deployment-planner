import React, { useState } from 'react';
import { signIn, signUp, requestPasswordReset } from '@/api/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Forgot-password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(loginEmail, loginPassword);
      window.location.href = '/';
    } catch (error) {
      toast.error(error.message || 'Failed to sign in');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await requestPasswordReset(resetEmail, `${window.location.origin}/reset-password`);
      setResetSent(true);
      toast.success('Reset email sent — check your inbox');
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (signupPassword !== signupConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (signupPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      await signUp({ email: signupEmail, password: signupPassword, fullName: signupFullName });

      toast.success('Account created! Check your email for a confirmation link, or sign in if email confirmation is disabled.');
    } catch (error) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative bg-cover bg-center"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Translucent gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/30 to-slate-900/60 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 bg-slate-900 rounded-xl shadow-lg">
            <Radio className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white drop-shadow-md">EmComm Planner</h1>
            <p className="text-sm text-slate-200 drop-shadow">Emergency Communications Deployment</p>
          </div>
        </div>

        <Card className="border-slate-200/60 bg-white/95 backdrop-blur-md shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-lg">Welcome</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                {!showForgotPassword ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <button
                          type="button"
                          onClick={() => { setShowForgotPassword(true); setResetEmail(loginEmail); setResetSent(false); }}
                          className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Your password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(false); setResetSent(false); }}
                      className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to sign in
                    </button>

                    {resetSent ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800 space-y-2">
                        <p className="font-medium">Reset email sent</p>
                        <p>
                          Check the inbox for <span className="font-mono">{resetEmail}</span> and click the link to choose a new password.
                          The link expires after a short time.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <p className="text-sm text-slate-600">
                          Enter your email and we'll send you a link to set a new password.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="your@email.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full bg-slate-900 hover:bg-slate-800"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send reset link'
                          )}
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Smith"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Min 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      placeholder="Confirm your password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-slate-800"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-200/80 mt-6 drop-shadow">
          EmComm Planner for ARES Groups
        </p>
      </div>
    </div>
  );
}
