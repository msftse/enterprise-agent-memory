param baseName string
param location string
param environment string

var searchName = 'search-${baseName}-${environment}'

resource searchService 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: searchName
  location: location
  sku: { name: environment == 'prod' ? 'standard' : 'basic' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
  }
}

output endpoint string = 'https://${searchService.name}.search.windows.net'
output searchName string = searchService.name
