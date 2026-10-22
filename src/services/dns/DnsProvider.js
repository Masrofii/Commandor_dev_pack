'use strict';

/**
 * Base DNS Provider Abstract Class
 */
class DnsProvider {
  constructor(name) {
    this.name = name;
  }

  async verifyToken() {
    throw new Error('verifyToken not implemented');
  }

  async getZone(domainName) {
    throw new Error('getZone not implemented');
  }

  async listRecords(zoneId, filters = {}) {
    throw new Error('listRecords not implemented');
  }

  async createRecord(zoneId, record) {
    throw new Error('createRecord not implemented');
  }

  async updateRecord(zoneId, recordId, record) {
    throw new Error('updateRecord not implemented');
  }

  async deleteRecord(zoneId, recordId) {
    throw new Error('deleteRecord not implemented');
  }
}

module.exports = DnsProvider;
