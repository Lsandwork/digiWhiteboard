"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type TabErrorBoundaryProps = {
  tab: string;
  children: ReactNode;
};

type TabErrorBoundaryState = {
  error: Error | null;
};

/**
 * One failing tab must not take down the whole admin shell.
 * Login used to look "stuck" because a later panel crash blanked the page.
 */
export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[admin-tab:${this.props.tab}]`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: TabErrorBoundaryProps) {
    if (prevProps.tab !== this.props.tab && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="admin-card space-y-4 p-6 text-white">
        <h2 className="text-xl font-black">This page hit a temporary error</h2>
        <p className="text-sm text-slate-300">
          Other admin pages are still available. Reload this tab — you will stay signed in.
        </p>
        <button
          type="button"
          className="admin-btn-primary"
          onClick={() => this.setState({ error: null })}
        >
          Reload this page
        </button>
      </section>
    );
  }
}
