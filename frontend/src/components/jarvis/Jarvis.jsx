import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { askServer, ChatRequestError, MAX_TOTAL_FILE_SIZE } from "./api.js";
import { createBrain, renderRich, WELCOME } from "./brain.js";
import {
  classifyFile,
  formatSize,
  imageSize,
  MAX_FILES,
  MAX_FILE_SIZE,
  readAttachment,
  think
} from "./files.js";

const STORAGE_KEY = "yana_jarvis_chat_v1";
const HINT_KEY = "yana_jarvis_hint_seen";
const SIZE_KEY = "yana_jarvis_size_v1";
const MIN_WIDTH = 300;
const MIN_HEIGHT = 340;

const RESIZE_CLASSES = ["is-jarvis-resizing", "is-jarvis-resizing-x", "is-jarvis-resizing-y", "is-jarvis-resizing-xy"];

const safeStorageGet = (store, key) => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};

const isMessage = (item) =>
  item &&
  typeof item === "object" &&
  (item.role === "bot" || item.role === "user") &&
  typeof item.text === "string";

const loadHistory = () => {
  try {
    const parsed = JSON.parse(safeStorageGet(sessionStorage, STORAGE_KEY) || "null");
    if (Array.isArray(parsed)) {
      const clean = parsed.filter(isMessage).map((item) => ({
        ...item,
        files: Array.isArray(item.files)
          ? item.files.filter((file) => file && typeof file === "object")
          : []
      }));
      if (clean.length) return clean;
    }
  } catch (error) {
    console.warn("[jarvis] bad history", error);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return [{ role: "bot", text: WELCOME }];
};

const saveHistory = (messages) => {
  try {
    const slim = messages.slice(-24).map((item) => ({
      role: item.role,
      text: item.text,
      mode: item.mode || undefined,
      files: (item.files || []).map((file) => ({
        name: file.name,
        kind: file.kind,
        type: file.type,
        size: file.size,
        text: String(file.text || "").slice(0, 2500)
      }))
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // ignore quota
  }
};

const markHintSeen = () => {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // ignore
  }
};

const maxSize = () => ({
  width: Math.max(MIN_WIDTH, window.innerWidth - 24),
  height: Math.max(MIN_HEIGHT, window.innerHeight - 96)
});

const clampSize = ({ width, height }) => {
  const max = maxSize();
  return {
    width: Math.round(Math.min(max.width, Math.max(MIN_WIDTH, width))),
    height: Math.round(Math.min(max.height, Math.max(MIN_HEIGHT, height)))
  };
};

const loadSize = () => {
  try {
    const parsed = JSON.parse(safeStorageGet(localStorage, SIZE_KEY) || "null");
    if (parsed && Number(parsed.width) > 0 && Number(parsed.height) > 0) {
      return clampSize({ width: Number(parsed.width), height: Number(parsed.height) });
    }
  } catch {
    // ignore
  }
  return null;
};

function FileThumbs({ files, className }) {
  if (!files?.length) return null;
  return (
    <div className={className}>
      {files.map((file, index) =>
        file.kind === "image" && file.preview ? (
          <img key={index} src={file.preview} alt={file.name || "Изображение"} />
        ) : (
          <div key={index} className="jarvis__file-chip">
            {file.name || "Файл"}
          </div>
        )
      )}
    </div>
  );
}

function Message({ message }) {
  const html = useMemo(() => (message.role === "bot" ? renderRich(message.text) : ""), [message]);
  return (
    <div className={`jarvis__msg jarvis__msg--${message.role}`}>
      {message.mode === "offline" && <p className="jarvis__mode-tag">Офлайн-режим</p>}
      <FileThumbs files={message.files} className="jarvis__files" />
      {message.text &&
        (message.role === "bot" ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div>{message.text}</div>)}
    </div>
  );
}

export default function Jarvis() {
  const brain = useMemo(() => createBrain(), []);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(null);
  const [input, setInput] = useState("");
  const [hintVisible, setHintVisible] = useState(() => !safeStorageGet(localStorage, HINT_KEY));
  const [size, setSize] = useState(loadSize);
  const [attachOpen, setAttachOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState({ kind: "online", text: "" });
  const [fileNotice, setFileNotice] = useState("");

  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const attachRef = useRef(null);
  const launcherRef = useRef(null);
  const openRef = useRef(open);
  const busyRef = useRef(false);
  const abortRef = useRef(null);
  const pendingRef = useRef(pending);
  openRef.current = open;
  pendingRef.current = pending;

  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, typing, open, status]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else launcherRef.current?.focus?.();
    const applyBodyLock = () => {
      const mobile = window.matchMedia("(max-width: 640px)").matches;
      document.body.classList.toggle("is-jarvis-open", open && mobile);
    };
    applyBodyLock();
    window.addEventListener("resize", applyBodyLock);
    return () => {
      window.removeEventListener("resize", applyBodyLock);
      document.body.classList.remove("is-jarvis-open");
    };
  }, [open]);

  useEffect(() => {
    if (!hintVisible) return undefined;
    const timer = setTimeout(() => {
      setHintVisible(false);
      markHintSeen();
    }, 8000);
    return () => clearTimeout(timer);
  }, [hintVisible]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (!openRef.current) return;
      if (attachOpen) {
        setAttachOpen(false);
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attachOpen]);

  useEffect(() => {
    if (!attachOpen) return undefined;
    const onDown = (event) => {
      if (!attachRef.current?.contains(event.target)) setAttachOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [attachOpen]);

  useEffect(() => {
    const onResize = () => setSize((current) => (current ? clampSize(current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const log = logRef.current;
    if (!root || !log) return undefined;
    let touchY = 0;

    const logAtEdge = (deltaY) => {
      const max = Math.max(0, log.scrollHeight - log.clientHeight);
      if (max <= 1) return true;
      if (deltaY > 0 && log.scrollTop >= max - 1) return true;
      return deltaY < 0 && log.scrollTop <= 0;
    };
    const onWheel = (event) => {
      if (!openRef.current) return;
      if (!log.contains(event.target) || logAtEdge(event.deltaY)) event.preventDefault();
    };
    const onTouchStart = (event) => {
      touchY = event.touches[0] ? event.touches[0].clientY : 0;
    };
    const onTouchMove = (event) => {
      if (!openRef.current || !event.touches[0]) return;
      const currentY = event.touches[0].clientY;
      const deltaY = touchY - currentY;
      touchY = currentY;
      if (logAtEdge(deltaY)) event.preventDefault();
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    log.addEventListener("touchstart", onTouchStart, { passive: true });
    log.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      log.removeEventListener("touchstart", onTouchStart);
      log.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      pending.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setChatOpen = (next) => {
    setOpen(next);
    if (!next) setAttachOpen(false);
    // Closing the panel must NOT abort an in-flight AI request — the reply
    // still lands in history when the user reopens the chat.
    setHintVisible(false);
    markHintSeen();
  };

  const clearChat = () => {
    if (busyRef.current) return;
    const next = [{ role: "bot", text: WELCOME }];
    setMessages(next);
    saveHistory(next);
    setStatus({ kind: "online", text: "" });
    setFileNotice("");
  };

  const startResize = (axis) => (event) => {
    if (!open || event.button) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const rect = panelRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };

    document.body.classList.add("is-jarvis-resizing");
    if (axis.includes("x")) document.body.classList.add("is-jarvis-resizing-x");
    if (axis.includes("y")) document.body.classList.add("is-jarvis-resizing-y");
    if (axis === "xy") document.body.classList.add("is-jarvis-resizing-xy");
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // some environments reject pointer capture
    }

    let latest = { width: rect.width, height: rect.height };
    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      latest = clampSize({
        width: axis.includes("x") ? start.width + (start.x - moveEvent.clientX) : start.width,
        height: axis.includes("y") ? start.height + (start.y - moveEvent.clientY) : start.height
      });
      setSize(latest);
    };
    const onUp = () => {
      document.body.classList.remove(...RESIZE_CLASSES);
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(latest));
      } catch {
        // ignore
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    window.addEventListener("pointerup", onUp);
  };

  const addFiles = async (list) => {
    const notices = [];
    const next = [...pendingRef.current];
    let total = next.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
    const accepted = [];

    for (const file of list) {
      if (next.length >= MAX_FILES) {
        notices.push(`Можно прикрепить не больше ${MAX_FILES} файлов`);
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        notices.push(`«${file.name || "файл"}» больше ${formatSize(MAX_FILE_SIZE)}`);
        continue;
      }
      if (total + file.size > MAX_TOTAL_FILE_SIZE) {
        notices.push(`Суммарный размер вложений — до ${formatSize(MAX_TOTAL_FILE_SIZE)}`);
        break;
      }
      if (next.some((item) => item.name === file.name && item.size === file.size)) {
        notices.push(`«${file.name || "файл"}» уже добавлен`);
        continue;
      }
      const kind = classifyFile(file);
      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        name: file.name || "файл",
        type: file.type || "",
        size: file.size || 0,
        kind,
        preview: kind === "image" ? URL.createObjectURL(file) : "",
        width: 0,
        height: 0
      };
      total += item.size;
      accepted.push(item);
      next.push(item);
    }

    pendingRef.current = next;
    setPending(next);
    setFileNotice(notices[0] || "");

    for (const item of accepted) {
      if (!item.preview) continue;
      try {
        const dims = await imageSize(item.preview);
        setPending((latest) => {
          const updated = latest.map((entry) => (entry.id === item.id ? { ...entry, ...dims } : entry));
          pendingRef.current = updated;
          return updated;
        });
      } catch {
        // ignore preview sizing failures
      }
    }
  };

  const removePending = (item) => {
    if (item.preview) URL.revokeObjectURL(item.preview);
    setPending((current) => current.filter((entry) => entry.id !== item.id));
    setFileNotice("");
  };

  const stopRequest = () => {
    abortRef.current?.abort();
  };

  const send = async (event) => {
    event?.preventDefault?.();
    const text = input.trim();
    const queued = pending;
    if ((!text && !queued.length) || busyRef.current) return;

    const previewFiles = queued.map(({ name, type, size, kind, preview, width, height }) => ({
      name,
      type,
      size,
      kind,
      preview,
      width,
      height,
      text: ""
    }));

    busyRef.current = true;
    setBusy(true);
    setInput("");
    setPending([]);
    setAttachOpen(false);
    setFileNotice("");
    setStatus({ kind: "online", text: "" });
    setMessages((current) => {
      const next = [...current, { role: "user", text, files: previewFiles }];
      saveHistory(next);
      return next;
    });
    setTyping(queued.length ? "Джарвис читает файл" : "Джарвис печатает");

    const controller = new AbortController();
    abortRef.current = controller;

    let reply;
    let files = previewFiles;
    let mode = "online";

    try {
      try {
        const result = await askServer([...messages, { role: "user", text, files: queued }], {
          signal: controller.signal
        });
        reply = result.reply;
        if (result.attachments?.length) {
          const byName = new Map(result.attachments.map((item) => [item.name, item]));
          files = previewFiles.map((file) => ({
            ...file,
            text: byName.get(file.name)?.text || file.text || ""
          }));
        }
        setStatus({ kind: "online", text: "" });
      } catch (error) {
        if (error instanceof ChatRequestError && error.code === "aborted") {
          reply = "Ответ остановлен. Можете отправить вопрос ещё раз.";
          mode = "cancelled";
          setStatus({ kind: "warn", text: "Запрос остановлен" });
        } else {
          files = await Promise.all(queued.map((item) => readAttachment(item)));
          reply = think(brain, text, files);
          mode = "offline";
          const detail =
            error instanceof ChatRequestError
              ? error.message
              : "Не удалось связаться с ИИ. Показан офлайн-ответ.";
          setStatus({ kind: "offline", text: detail });
          const delay = queued.length ? 400 : Math.min(1400, 450 + reply.length * 8);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } catch {
      reply = "Не удалось обработать сообщение. Попробуйте ещё раз или опишите вопрос текстом.";
      mode = "error";
      setStatus({ kind: "error", text: "Ошибка обработки сообщения" });
    }

    // Keep blob: previews alive — they are still referenced by messages in the log.

    setTyping(null);
    setMessages((current) => {
      const next = current.slice();
      const last = next[next.length - 1];
      if (last?.role === "user") next[next.length - 1] = { ...last, files };
      next.push({
        role: "bot",
        text: reply,
        mode: mode === "offline" ? "offline" : mode === "cancelled" ? "cancelled" : undefined
      });
      saveHistory(next);
      return next;
    });
    busyRef.current = false;
    setBusy(false);
    abortRef.current = null;
    if (openRef.current) inputRef.current?.focus();
  };

  const panelStyle = size
    ? { width: `${size.width}px`, height: `${size.height}px`, maxHeight: `${maxSize().height}px` }
    : undefined;

  return (
    <div className={`jarvis${open ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" className="jarvis__hint" hidden={!hintVisible} onClick={() => setChatOpen(true)}>
        Джарвис на связи — подберу процедуру или запись
      </button>
      <section
        className="jarvis__panel"
        hidden={!open}
        role="dialog"
        aria-modal="false"
        aria-label="Чат с Джарвисом"
        ref={panelRef}
        style={panelStyle}
      >
        <div
          className="jarvis__resize jarvis__resize--left"
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину чата"
          onPointerDown={startResize("x")}
        />
        <div
          className="jarvis__resize jarvis__resize--top"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Изменить высоту чата"
          onPointerDown={startResize("y")}
        />
        <div
          className="jarvis__resize jarvis__resize--corner"
          aria-label="Изменить ширину и высоту чата"
          onPointerDown={startResize("xy")}
        />
        <header className="jarvis__head">
          <div className="jarvis__identity">
            <span className="jarvis__avatar" aria-hidden="true">
              J
            </span>
            <div>
              <p className="jarvis__name">Джарвис</p>
              <p className={`jarvis__role${status.kind === "offline" ? " is-offline" : ""}`}>
                {status.kind === "offline"
                  ? "Офлайн-режим"
                  : status.kind === "warn"
                    ? "Остановлено"
                    : "Консультант кабинета"}
              </p>
            </div>
          </div>
          <div className="jarvis__head-actions">
            {busy ? (
              <button className="jarvis__stop" type="button" onClick={stopRequest}>
                Стоп
              </button>
            ) : (
              <button className="jarvis__clear" type="button" onClick={clearChat} aria-label="Очистить чат">
                Очистить
              </button>
            )}
            <button className="jarvis__close" type="button" aria-label="Закрыть чат" onClick={() => setChatOpen(false)}>
              ×
            </button>
          </div>
        </header>
        {(status.text || fileNotice) && (
          <div className={`jarvis__banner jarvis__banner--${status.kind === "online" ? "info" : status.kind}`} role="status">
            <span>{fileNotice || status.text}</span>
            {status.kind === "offline" && (
              <button type="button" onClick={() => setStatus({ kind: "online", text: "" })}>
                Скрыть
              </button>
            )}
          </div>
        )}
        <div className="jarvis__log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => (
            <Message key={index} message={message} />
          ))}
          {typing && (
            <div className="jarvis__msg jarvis__msg--bot is-typing">
              <span className="jarvis__typing" role="status" aria-label={typing}>
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>
        <div className="jarvis__composer">
          <div className="jarvis__pending" hidden={!pending.length}>
            {pending.map((item) => (
              <div className="jarvis__pending-item" key={item.id}>
                {item.kind === "image" && item.preview ? (
                  <img src={item.preview} alt={item.name} />
                ) : (
                  <span>{item.name}</span>
                )}
                <button
                  type="button"
                  className="jarvis__pending-remove"
                  aria-label={`Убрать ${item.name}`}
                  onClick={() => removePending(item)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <form className="jarvis__form" onSubmit={send}>
            <input
              className="jarvis__file-input"
              type="file"
              multiple
              hidden
              ref={fileRef}
              onChange={(event) => {
                addFiles([...(event.target.files || [])]);
                event.target.value = "";
              }}
            />
            <div className={`jarvis__attach${attachOpen ? " is-open" : ""}`} ref={attachRef}>
              <button
                className="jarvis__attach-btn"
                type="button"
                aria-label="Прикрепить файл"
                aria-expanded={attachOpen}
                aria-controls="jarvis-attach-pop"
                onClick={() => setAttachOpen((current) => !current)}
              >
                {attachOpen ? "×" : "+"}
              </button>
              {attachOpen && (
                <div className="jarvis__attach-pop" id="jarvis-attach-pop" role="region" aria-label="Отправка файлов">
                  <p className="jarvis__attach-title">Отправить файл</p>
                  <p className="jarvis__attach-note">
                    До {formatSize(MAX_FILE_SIZE)} на файл, суммарно до {formatSize(MAX_TOTAL_FILE_SIZE)}, максимум{" "}
                    {MAX_FILES} файла. Файлы уходят в ИИ-сервис для разбора — без диагноза по фото.
                  </p>
                  <button
                    type="button"
                    className={`jarvis__drop${dropActive ? " is-active" : ""}`}
                    onClick={() => fileRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDropActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropActive(true);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropActive(false);
                      addFiles([...(event.dataTransfer?.files || [])]);
                    }}
                  >
                    Перетащите файлы сюда
                    <span>или нажмите, чтобы выбрать</span>
                  </button>
                  {pending.length > 0 && (
                    <ul className="jarvis__attach-list">
                      {pending.map((item) => (
                        <li key={item.id}>
                          <span>
                            {item.name}
                            <small>{formatSize(item.size)}</small>
                          </span>
                          <button type="button" aria-label={`Убрать ${item.name}`} onClick={() => removePending(item)}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label className="visually-hidden" htmlFor="jarvis-input">
              Сообщение Джарвису
            </label>
            <input
              className="jarvis__input"
              id="jarvis-input"
              name="message"
              type="text"
              autoComplete="off"
              enterKeyHint="send"
              maxLength={600}
              placeholder="Напишите вопрос…"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="jarvis__send" type="submit" aria-label="Отправить" disabled={busy}>
              →
            </button>
          </form>
        </div>
      </section>
      <button
        className="jarvis__launcher"
        type="button"
        aria-expanded={open}
        aria-label="Открыть чат с консультантом"
        ref={launcherRef}
        onClick={() => setChatOpen(!open)}
      >
        <span className="jarvis__pulse" aria-hidden="true" />
        <span className="jarvis__launcher-mark jarvis__launcher-mark--j">J</span>
        <span className="jarvis__launcher-mark jarvis__launcher-mark--close">×</span>
      </button>
    </div>
  );
}
