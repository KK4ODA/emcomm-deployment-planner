import React from 'react';
import { ErrorState } from './ErrorState';

/**
 * Catches render errors below it so a single broken page does not blank the
 * whole application shell.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <ErrorState
            title="Something went wrong on this page"
            error={this.state.error}
            onRetry={this.reset}
            retryLabel="Try again"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
