import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback below keeps the app usable even if a render crashes.
  }

  private reset = (): void => {
    this.props.onReset();
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-10 text-fg">
        <div className="w-full max-w-md rounded-sheet border border-border bg-surface p-6 shadow-card">
          <h1 className="text-xl font-semibold tracking-tight">
            Что-то пошло не так
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Интерфейс столкнулся с ошибкой. Перезагрузите страницу — история и
            локальные сообщения сохранятся.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 w-full rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            Перезагрузить
          </button>
        </div>
      </main>
    );
  }
}
