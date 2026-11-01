/**
 * Live house state shared by every screen.
 *
 * The provider loads one snapshot over HTTP and then keeps it fresh through the
 * WebSocket. A dropped socket is retried automatically so the interface
 * recovers without a page reload.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { ApiError, getState, websocketUrl } from "./api";
import type { HouseState } from "./types";

export interface LiveStateValue {
  state: HouseState | null;
  connected: boolean;
  error: string | null;
}

const LiveStateContext = createContext<LiveStateValue | undefined>(undefined);

const RECONNECT_DELAY_MS = 1500;
const GENERIC_ERROR = "Die Verbindung zum Server ist fehlgeschlagen.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return GENERIC_ERROR;
}

interface SnapshotMessage {
  type?: string;
  payload?: HouseState;
  error?: { code?: string; message?: string };
}

export function LiveStateProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<HouseState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;

    const scheduleReconnect = () => {
      if (disposed || retryTimer !== null) {
        return;
      }
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const handleFrame = (data: string) => {
      let message: SnapshotMessage;
      try {
        message = JSON.parse(data) as SnapshotMessage;
      } catch {
        return;
      }
      if (message.type === "snapshot" && message.payload) {
        setState(message.payload);
        setError(null);
      } else if (message.type === "error" && message.error?.message) {
        setError(message.error.message);
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }
      try {
        socket = new WebSocket(websocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!disposed) {
          setConnected(true);
          setError(null);
        }
      };
      socket.onmessage = (event) => {
        if (!disposed && typeof event.data === "string") {
          handleFrame(event.data);
        }
      };
      socket.onerror = () => {
        // The close handler owns reconnection.
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          scheduleReconnect();
        }
      };
    };

    const loadSnapshot = async () => {
      try {
        const snapshot = await getState();
        if (!disposed) {
          setState(snapshot);
          setError(null);
        }
      } catch (loadError) {
        if (!disposed) {
          setError(messageFor(loadError));
        }
      }
    };

    void loadSnapshot();
    connect();

    return () => {
      disposed = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      setConnected(false);
    };
  }, []);

  return (
    <LiveStateContext.Provider value={{ state, connected, error }}>
      {children}
    </LiveStateContext.Provider>
  );
}

export function useLiveState(): LiveStateValue {
  const value = useContext(LiveStateContext);
  if (!value) {
    throw new Error("useLiveState must be used inside a LiveStateProvider");
  }
  return value;
}
