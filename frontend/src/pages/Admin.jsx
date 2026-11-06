import { useCallback, useEffect, useRef, useState } from "react";
import * as shop from "../lib/shop.js";
import { useBodyClass, useEscape, useShopVersion } from "../lib/hooks.js";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import ProductsPanel from "../components/admin/ProductsPanel.jsx";
import OrdersPanel from "../components/admin/OrdersPanel.jsx";
import ClientsPanel from "../components/admin/ClientsPanel.jsx";
import StatsModal from "../components/admin/StatsModal.jsx";

const POLL_INTERVAL = 20000;

const TABS = [
  { code: "products", label: "Товары" },
  { code: "orders", label: "Заказы" },
  { code: "clients", label: "Клиенты" }
];

function LoginPanel({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverMissing, setServerMissing] = useState(false);

  useEffect(() => {
    shop.ready
      .catch((err) => console.warn("[admin] ready failed", err))
      .finally(() => setServerMissing(!shop.isServerMode()));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const ok = await shop.loginAdmin(password);
      if (!ok) {
        setError("Неверный пароль");
        return;
      }
      setPassword("");
      onLogin();
    } catch (err) {
      setError(err?.message || "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-login">
      <h2>Вход</h2>
      <p className="admin-login__hint">
        Пароль задаётся в файле <code>.env</code> (ADMIN_PASSWORD). Сайт нужно открывать через <code>serve.ps1</code>.
      </p>
      <p className="admin-error" hidden={!serverMissing}>
        Сервер не найден. Запустите serve.ps1 и откройте сайт через него — иначе каталог и заказы не общие.
      </p>
      <form onSubmit={submit}>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="admin-btn" type="submit" disabled={busy}>
          Войти
        </button>
        <p className="admin-error" role="alert" hidden={!error}>
          {error || "Неверный пароль"}
        </p>
      </form>
    </section>
  );
}

function Dashboard() {
  const [tab, setTab] = useState("products");
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const newCount = shop.getOrders().filter((order) => order.status === "new").length;

  const refresh = useCallback(async ({ silent }) => {
    if (refreshingRef.current || !shop.isAdminLoggedIn()) return;
    refreshingRef.current = true;
    if (!silent) setRefreshing(true);
    try {
      if (shop.isServerMode()) await shop.refreshOrders();
    } catch (error) {
      if (!silent) window.alert(error.message || "Не удалось обновить заказы");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    shop.refreshProducts().catch(() => {});
    refresh({ silent: true });

    const timer = shop.isServerMode()
      ? window.setInterval(() => {
          if (!document.hidden) refresh({ silent: true });
        }, POLL_INTERVAL)
      : null;
    const onVisible = () => {
      if (!document.hidden) refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <section className="admin-dashboard">
      <nav className="admin-tabs" aria-label="Разделы админки">
        {TABS.map((item) => (
          <button
            key={item.code}
            className={`admin-tabs__btn${tab === item.code ? " is-active" : ""}`}
            type="button"
            onClick={() => setTab(item.code)}
          >
            {item.label}
            {item.code === "orders" && (
              <span className="admin-tabs__badge" hidden={newCount <= 0}>
                {newCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <ErrorBoundary name={`вкладка ${tab}`} resetKeys={[tab]} fallback={({ reset }) => (
        <div className="section-error" role="alert">
          <p>Раздел админки временно недоступен.</p>
          <button type="button" onClick={reset}>Перезагрузить блок</button>
        </div>
      )}>
        {tab === "products" && <ProductsPanel />}
        {tab === "orders" && <OrdersPanel refreshing={refreshing} onRefresh={() => refresh({ silent: false })} />}
        {tab === "clients" && <ClientsPanel />}
      </ErrorBoundary>
    </section>
  );
}

export default function Admin() {
  useShopVersion();
  const [status, setStatus] = useState("loading");
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await shop.ready;
      } catch (error) {
        // continue with local cache
      }
      const ok = await shop.restoreAdminSession();
      setStatus(ok || shop.isAdminLoggedIn() ? "dashboard" : "login");
    })();
  }, []);

  const closeStats = useCallback(() => setStatsOpen(false), []);
  useEscape(closeStats, statsOpen);
  useBodyClass("is-stats-open", statsOpen);

  const logout = async () => {
    await shop.logoutAdmin();
    setStatsOpen(false);
    setStatus("login");
  };

  const loggedIn = status === "dashboard";

  return (
    <>
      <div className="admin">
        <header className="admin__top">
          <div>
            <p className="admin__eyebrow">Панель управления</p>
            <h1>Админ-панель</h1>
          </div>
          <div className="admin__top-actions">
            <a className="admin-link" href="./index.html">
              ← На сайт
            </a>
            {loggedIn && (
              <>
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setStatsOpen(true)}>
                  Сводка
                </button>
                <button className="admin-btn admin-btn--ghost" type="button" onClick={logout}>
                  Выйти
                </button>
              </>
            )}
          </div>
        </header>

        {status === "login" && <LoginPanel onLogin={() => setStatus("dashboard")} />}
        {loggedIn && <Dashboard />}
      </div>

      <ErrorBoundary name="сводка" fallback={null}>
        <StatsModal open={statsOpen} onClose={closeStats} />
      </ErrorBoundary>
    </>
  );
}
