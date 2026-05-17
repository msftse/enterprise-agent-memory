targetScope = 'resourceGroup'

@description('Base name for all resources')
param baseName string

@description('Azure region')
param location string = resourceGroup().location

@description('Environment (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Deploy Azure OpenAI (requires quota approval)')
param deployOpenAI bool = false

@description('Azure OpenAI model deployments')
param chatModelName string = 'gpt-4o'
param embeddingModelName string = 'text-embedding-3-large'

// Cosmos DB
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos-${baseName}'
  params: {
    baseName: baseName
    location: location
    environment: environment
  }
}

// Azure AI Search
module aiSearch 'modules/ai-search.bicep' = {
  name: 'ai-search-${baseName}'
  params: {
    baseName: baseName
    location: location
    environment: environment
  }
}

// Azure OpenAI (conditional — requires quota)
module openai 'modules/openai.bicep' = if (deployOpenAI) {
  name: 'openai-${baseName}'
  params: {
    baseName: baseName
    location: location
    chatModelName: chatModelName
    embeddingModelName: embeddingModelName
  }
}

// Storage Account
module storage 'modules/storage.bicep' = {
  name: 'storage-${baseName}'
  params: {
    baseName: baseName
    location: location
    environment: environment
  }
}

// Monitoring
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-${baseName}'
  params: {
    baseName: baseName
    location: location
  }
}

// Container App
module containerApp 'modules/container-app.bicep' = {
  name: 'container-app-${baseName}'
  params: {
    baseName: baseName
    location: location
    environment: environment
    cosmosEndpoint: cosmos.outputs.endpoint
    aiSearchEndpoint: aiSearch.outputs.endpoint
    openaiEndpoint: deployOpenAI ? openai.outputs.endpoint : ''
    storageAccountUrl: storage.outputs.blobEndpoint
    appInsightsConnectionString: monitoring.outputs.connectionString
  }
}

// Outputs
output cosmosEndpoint string = cosmos.outputs.endpoint
output aiSearchEndpoint string = aiSearch.outputs.endpoint
output openaiEndpoint string = deployOpenAI ? openai.outputs.endpoint : 'not-deployed'
output containerAppUrl string = containerApp.outputs.fqdn
output storageAccountUrl string = storage.outputs.blobEndpoint
