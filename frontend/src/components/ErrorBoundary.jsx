import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", this.props.name || "", error, info?.componentStack);
    this.props.onError?.(error, info);
    for (const key of this.props.clearStorageKeys || []) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.error &&
      this.props.resetKeys &&
      prevProps.resetKeys?.some((key, index) => key !== this.props.resetKeys[index])
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback !== undefined) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback({ error: this.state.error, reset: this.reset })
        : this.props.fallback;
    }

    return (
      <div className="app-crash" role="alert">
        <h1>Что-то пошло не так</h1>
        <p>
          {this.props.name
            ? `Блок «${this.props.name}» не смог отобразиться.`
            : "Страница не смогла отобразиться."}{" "}
          Попробуйте перезагрузить блок — если не поможет, напишите нам в WhatsApp или Telegram.
        </p>
        <button type="button" onClick={this.reset}>
          Перезагрузить блок
        </button>
        <button type="button" onClick={() => window.location.reload()}>
          Обновить страницу
        </button>
      </div>
    );
  }
}
