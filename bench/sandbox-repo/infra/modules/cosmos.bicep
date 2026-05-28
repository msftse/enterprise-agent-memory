@description('Base name')
param baseName string
param location string
param environment string

var accountName = 'cosmos-${baseName}-${environment}'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }]
    capabilities: [{ name: 'EnableServerless' }]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'agentmemory'
  properties: {
    resource: { id: 'agentmemory' }
  }
}

var containers = ['sessions', 'observations', 'memories', 'graph-nodes', 'graph-edges', 'audit-entries']

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for name in containers: {
  parent: database
  name: name
  properties: {
    resource: {
      id: name
      partitionKey: { paths: ['/tenantId'], kind: 'Hash' }
    }
  }
}]

output endpoint string = cosmosAccount.properties.documentEndpoint
output accountName string = cosmosAccount.name
