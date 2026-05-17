param baseName string
param location string
param environment string
param cosmosEndpoint string
param aiSearchEndpoint string
param openaiEndpoint string
param storageAccountUrl string
param appInsightsConnectionString string

var envName = 'env-${baseName}-${environment}'
var appName = 'app-${baseName}-${environment}'

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {}
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'http' }
      secrets: []
    }
    template: {
      containers: [{
        name: 'agent-memory'
        image: 'mcr.microsoft.com/k8se/quickstart:latest' // placeholder — replace with ACR image
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'PORT', value: '8080' }
          { name: 'NODE_ENV', value: environment == 'prod' ? 'production' : 'development' }
          { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
          { name: 'COSMOS_DATABASE', value: 'agentmemory' }
          { name: 'AI_SEARCH_ENDPOINT', value: aiSearchEndpoint }
          { name: 'AI_SEARCH_INDEX', value: 'agent-memory' }
          { name: 'AZURE_OPENAI_ENDPOINT', value: openaiEndpoint }
          { name: 'STORAGE_ACCOUNT_URL', value: storageAccountUrl }
          { name: 'AUTH_DISABLED', value: environment == 'dev' ? 'true' : 'false' }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        ]
      }]
      scale: { minReplicas: environment == 'prod' ? 1 : 0, maxReplicas: 10 }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output principalId string = containerApp.identity.principalId
