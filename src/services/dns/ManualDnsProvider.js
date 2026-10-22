'use strict';
const DnsProvider = require('./DnsProvider');

class ManualDnsProvider extends DnsProvider {
  constructor() {
    super('manual');
  }

  async verifyToken() {
    return { valid: true, status: 'manual' };
  }

  async getZone(domainName) {
    return {
      id: `manual-zone-${domainName.replace(/[^a-zA-Z0-9]/g, '-')}`,
      name: domainName,
      status: 'active',
      nameServers: ['Manual / External DNS Provider']
    };
  }

  async listRecords(zoneId, filters = {}) {
    return [];
  }

  async createRecord(zoneId, record) {
    return {
      id: `manual-rec-${Date.now()}`,
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl || 300,
      proxied: false,
      manualInstructions: `Please log in to your DNS registrar/provider and add: Type: ${record.type}, Name: ${record.name}, Value: ${record.content}, TTL: ${record.ttl || 300}`
    };
  }

  async updateRecord(zoneId, recordId, record) {
    return {
      id: recordId,
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl || 300,
      proxied: false,
      manualInstructions: `Please update in your DNS registrar/provider: Type: ${record.type}, Name: ${record.name}, Value: ${record.content}`
    };
  }

  async deleteRecord(zoneId, recordId) {
    return {
      id: recordId,
      deleted: true,
      manualInstructions: 'Please remove this record from your authoritative DNS registrar/provider.'
    };
  }
}

module.exports = ManualDnsProvider;
