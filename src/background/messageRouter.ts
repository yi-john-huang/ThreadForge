/**
 * Message router for background service worker
 * Handles communication between content scripts, popup, and background services
 */

import { BackgroundMessage, MessageResponse, MessageSender, SendResponse } from './types';

export async function handleMessage(
  message: BackgroundMessage,
  sender: MessageSender,
  sendResponse: SendResponse
): Promise<boolean> {
  try {
    console.log('Background received message:', message.type, sender);

    const response: MessageResponse = {
      success: false,
      requestId: message.requestId
    };

    switch (message.type) {
      case 'PING':
        response.success = true;
        response.data = { pong: true, timestamp: Date.now() };
        break;

      case 'FETCH_THREAD_REPLIES':
        response.data = await handleFetchThreadReplies(message.payload);
        response.success = true;
        break;

      case 'GET_THREAD_DATA':
        response.data = await handleGetThreadData(message.payload);
        response.success = true;
        break;

      case 'GET_AUTH_STATUS':
        response.data = await handleGetAuthStatus();
        response.success = true;
        break;

      case 'AUTHENTICATE':
        response.data = await handleAuthenticate(message.payload);
        response.success = true;
        break;

      case 'GET_SETTINGS':
        response.data = await handleGetSettings();
        response.success = true;
        break;

      case 'UPDATE_SETTINGS':
        response.data = await handleUpdateSettings(message.payload);
        response.success = true;
        break;

      default:
        response.error = {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${message.type}`
        };
        break;
    }

    sendResponse(response);
    return true; // Indicates we will send a response asynchronously

  } catch (error) {
    console.error('Error handling message:', error);
    
    const errorResponse: MessageResponse = {
      success: false,
      error: {
        code: 'HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      requestId: message.requestId
    };

    sendResponse(errorResponse);
    return true;
  }
}

// Handler functions for different message types
async function handleFetchThreadReplies(payload: any): Promise<any> {
  // TODO: Implement Threads API integration
  console.log('Fetching thread replies for:', payload);
  
  // Mock response for now
  return {
    threadId: payload.threadId,
    replies: [],
    totalCount: 0
  };
}

async function handleGetThreadData(payload: any): Promise<any> {
  // TODO: Implement Threads API integration
  console.log('Getting thread data for:', payload);
  
  // Mock response for now
  return {
    threadId: payload.threadId,
    author: null,
    content: '',
    metadata: {}
  };
}

async function handleGetAuthStatus(): Promise<any> {
  // TODO: Implement authentication status check
  console.log('Getting authentication status');
  
  // Mock response for now
  return {
    isAuthenticated: false,
    userId: null,
    scopes: [],
    expiresAt: null
  };
}

async function handleAuthenticate(payload: any): Promise<any> {
  // TODO: Implement OAuth2 authentication
  console.log('Starting authentication process:', payload);
  
  // Mock response for now
  return {
    success: false,
    reason: 'Not implemented yet'
  };
}

async function handleGetSettings(): Promise<any> {
  // TODO: Implement settings retrieval from chrome.storage
  console.log('Getting extension settings');
  
  try {
    const result = await chrome.storage.sync.get('threadForgeSettings');
    return result.threadForgeSettings || {};
  } catch (error) {
    console.error('Error getting settings:', error);
    return {};
  }
}

async function handleUpdateSettings(payload: any): Promise<any> {
  // TODO: Implement settings update in chrome.storage
  console.log('Updating extension settings:', payload);
  
  try {
    await chrome.storage.sync.set({ threadForgeSettings: payload });
    return payload;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
}