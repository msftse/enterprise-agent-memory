param baseName string
param location string
param environment string

var storageName = replace('st${baseName}${environment}', '-', '')

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource auditContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageAccount.name}/default/audit-logs'
  properties: { publicAccess: 'None' }
}

resource rawContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageAccount.name}/default/raw-observations'
  properties: { publicAccess: 'None' }
}

output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output accountName string = storageAccount.name
