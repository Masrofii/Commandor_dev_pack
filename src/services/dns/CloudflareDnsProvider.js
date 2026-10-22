'use strict';
const axios = require('axios');
const DnsProvider = require('./DnsProvider');
const logger = require('../../monitoring/logger');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

class CloudflareDnsProvider extends DnsProvider {
  constructor(apiToken) {
    super('cloudflare');
    if (!apiToken || typeof apiToken !== 'string') {
      throw new Error('Cloudflare API Token is required');
    }
    this.apiToken = apiToken.trim();
  }

  async _request(method, endpoint, data = null, params = null, retries = 2) {
    const url = `${CF_API_BASE}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await axios({
          method,
          url,
          headers,
          data,
          params,
          timeout: 10000
        });

        if (!response.data || !response.data.success) {
          const errors = response.data?.errors?.map(e => e.message).join(', ') || 'Unknown Cloudflare API error';
          throw new Error(errors);
        }

        return response.data.result;
      } catch (err) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.errors?.map(e => e.message).join(', ') || err.message;

        // Rate limiting (HTTP 429) backoff
        if (status === 429 && attempt < retries) {
          const retryAfterSec = parseInt(err.response?.headers?.['retry-after'], 10) || (attempt + 1) * 2;
          logger.warn({ attempt, retryAfterSec }, 'Cloudflare rate limit hit, waiting to retry');
          await new Promise(r => setTimeout(r, retryAfterSec * 1000));
          continue;
        }

        if (attempt === retries) {
          logger.error({ endpoint, status, errMsg }, 'Cloudflare API request failed');
          throw new Error(`Cloudflare API Error (${status || 'Network'}): ${errMsg}`);
        }
      }
    }
  }

  async verifyToken() {
    try {
      const res = await this._request('GET', '/user/tokens/verify');
      return {
        valid: res?.status === 'active',
        status: res?.status || 'inactive',
        id: res?.id
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async getZone(domainName) {
    const cleanDomain = String(domainName).trim().toLowerCase();
    const zones = await this._request('GET', '/zones', null, { name: cleanDomain, status: 'active' });
    if (!zones || zones.length === 0) {
      // Try resolving parent domain if subdomain
      const parts = cleanDomain.split('.');
      if (parts.length > 2) {
        const parent = parts.slice(1).join('.');
        const parentZones = await this._request('GET', '/zones', null, { name: parent, status: 'active' });
        if (parentZones && parentZones.length > 0) {
          return {
            id: parentZones[0].id,
            name: parentZones[0].name,
            status: parentZones[0].status,
            nameServers: parentZones[0].name_servers
          };
        }
      }
      throw new Error(`Cloudflare zone for domain "${cleanDomain}" not found in your account.`);
    }

    return {
      id: zones[0].id,
      name: zones[0].name,
      status: zones[0].status,
      nameServers: zones[0].name_servers
    };
  }

  async listRecords(zoneId, filters = {}) {
    const params = {};
    if (filters.name) params.name = filters.name;
    if (filters.type) params.type = filters.type;
    params.per_page = filters.limit || 100;

    const records = await this._request('GET', `/zones/${zoneId}/dns_records`, null, params);
    return (records || []).map(r => ({
      id: r.id,
      zoneId: r.zone_id,
      name: r.name,
      type: r.type,
      content: r.content,
      proxiable: r.proxiable,
      proxied: r.proxied,
      ttl: r.ttl,
      createdOn: r.created_on,
      modifiedOn: r.modified_on
    }));
  }

  async createRecord(zoneId, record) {
    if (!record.type || !record.name || !record.content) {
      throw new Error('type, name, and content are required for DNS record');
    }

    const payload = {
      type: String(record.type).toUpperCase(),
      name: String(record.name).trim(),
      content: String(record.content).trim(),
      ttl: record.ttl || 1, // 1 = automatic in Cloudflare
      proxied: Boolean(record.proxied)
    };

    if (record.priority !== undefined) {
      payload.priority = parseInt(record.priority, 10);
    }

    const res = await this._request('POST', `/zones/${zoneId}/dns_records`, payload);
    return {
      id: res.id,
      name: res.name,
      type: res.type,
      content: res.content,
      proxied: res.proxied,
      ttl: res.ttl
    };
  }

  async updateRecord(zoneId, recordId, record) {
    const payload = {
      type: String(record.type).toUpperCase(),
      name: String(record.name).trim(),
      content: String(record.content).trim(),
      ttl: record.ttl || 1,
      proxied: Boolean(record.proxied)
    };

    const res = await this._request('PUT', `/zones/${zoneId}/dns_records/${recordId}`, payload);
    return {
      id: res.id,
      name: res.name,
      type: res.type,
      content: res.content,
      proxied: res.proxied,
      ttl: res.ttl
    };
  }

  async deleteRecord(zoneId, recordId) {
    const res = await this._request('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
    return {
      id: res.id,
      deleted: true
    };
  }
}

module.exports = CloudflareDnsProvider;
