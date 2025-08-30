/**
 * Background script message types and interfaces
 */

export interface BackgroundMessage {
  type: string;
  payload?: any;
  requestId?: string;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
  requestId?: string;
}

export interface ContentScriptMessage extends BackgroundMessage {
  type: 'FETCH_THREAD_REPLIES' | 'GET_THREAD_DATA' | 'PING';
}

export interface PopupMessage extends BackgroundMessage {
  type: 'GET_AUTH_STATUS' | 'AUTHENTICATE' | 'GET_SETTINGS' | 'UPDATE_SETTINGS';
}

export type MessageSender = chrome.runtime.MessageSender;
export type SendResponse = (response: MessageResponse) => void;