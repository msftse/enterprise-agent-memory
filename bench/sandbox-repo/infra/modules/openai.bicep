param baseName string
param location string
param chatModelName string
param embeddingModelName string

var openaiName = 'oai-${baseName}'

resource openaiAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: openaiName
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: { customSubDomainName: openaiName }
}

resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openaiAccount
  name: chatModelName
  sku: { name: 'Standard', capacity: 30 }
  properties: {
    model: { format: 'OpenAI', name: chatModelName, version: '2024-11-20' }
  }
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openaiAccount
  name: embeddingModelName
  sku: { name: 'Standard', capacity: 120 }
  properties: {
    model: { format: 'OpenAI', name: embeddingModelName, version: '1' }
  }
  dependsOn: [chatDeployment]
}

output endpoint string = openaiAccount.properties.endpoint
output accountName string = openaiAccount.name
