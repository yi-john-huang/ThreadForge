/**
 * Tests for manifest.json validation and OAuth2 integration requirements
 * Requirements: 1.1, 2.1 - API Integration and Authentication Management
 */

import * as fs from 'fs';
import * as path from 'path';

interface ManifestV3 {
  manifest_version: number;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  background: {
    service_worker: string;
  };
  host_permissions: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: string;
  }>;
  action: {
    default_popup: string;
    default_icon: Record<string, string>;
  };
  icons: Record<string, string>;
  web_accessible_resources: Array<{
    resources: string[];
    matches: string[];
  }>;
  oauth2?: {
    client_id: string;
    scopes: string[];
  };
}

describe('Manifest.json OAuth2 Integration', () => {
  let manifest: ManifestV3;
  
  beforeAll(() => {
    const manifestPath = path.join(__dirname, '../../manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestContent);
  });

  describe('OAuth2 Authentication Requirements', () => {
    test('should include identity permission for OAuth2 flow', () => {
      expect(manifest.permissions).toContain('identity');
    });

    test('should include host permissions for Threads API domain', () => {
      expect(manifest.host_permissions).toContain('https://graph.threads.net/*');
    });

    test('should have background service worker configured', () => {
      expect(manifest.background).toBeDefined();
      expect(manifest.background.service_worker).toBe('background.js');
    });

    test('should include oauth2 configuration section with client_id placeholder', () => {
      expect(manifest.oauth2).toBeDefined();
      expect(manifest.oauth2?.client_id).toBeDefined();
      expect(typeof manifest.oauth2?.client_id).toBe('string');
      expect(manifest.oauth2?.client_id).not.toBe('');
    });

    test('should include required OAuth2 scopes for Threads API', () => {
      expect(manifest.oauth2?.scopes).toBeDefined();
      expect(Array.isArray(manifest.oauth2?.scopes)).toBe(true);
      expect(manifest.oauth2?.scopes).toContain('threads_basic');
      expect(manifest.oauth2?.scopes).toContain('threads_content_publish');
      expect(manifest.oauth2?.scopes).toContain('threads_read_replies');
    });
  });

  describe('Manifest Structure Validation', () => {
    test('should be valid Manifest V3 format', () => {
      expect(manifest.manifest_version).toBe(3);
      expect(typeof manifest.name).toBe('string');
      expect(typeof manifest.version).toBe('string');
      expect(typeof manifest.description).toBe('string');
    });

    test('should maintain existing permissions', () => {
      expect(manifest.permissions).toContain('activeTab');
      expect(manifest.permissions).toContain('scripting');  
      expect(manifest.permissions).toContain('storage');
    });

    test('should maintain existing host permissions for Threads.com', () => {
      expect(manifest.host_permissions).toContain('https://www.threads.com/*');
      expect(manifest.host_permissions).toContain('https://threads.com/*');
      expect(manifest.host_permissions).toContain('https://www.threads.net/*');
      expect(manifest.host_permissions).toContain('https://threads.net/*');
    });
  });

  describe('Threads API Integration Requirements', () => {
    test('should have proper service worker configuration for API calls', () => {
      // Requirement 1.1: Extension shall establish connection to Threads API
      expect(manifest.background?.service_worker).toBeDefined();
      expect(manifest.permissions).toContain('identity');
    });

    test('should allow cross-origin requests to Threads API endpoints', () => {
      // Requirement 1.1: Proper authentication credentials
      expect(manifest.host_permissions).toContain('https://graph.threads.net/*');
    });
  });
});