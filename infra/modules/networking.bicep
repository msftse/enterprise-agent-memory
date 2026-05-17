param baseName string
param location string

var vnetName = 'vnet-${baseName}'

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.0.0.0/16'] }
    subnets: [
      { name: 'container-apps', properties: { addressPrefix: '10.0.1.0/24' } }
      { name: 'private-endpoints', properties: { addressPrefix: '10.0.2.0/24' } }
    ]
  }
}

output vnetId string = vnet.id
output containerAppsSubnetId string = vnet.properties.subnets[0].id
output privateEndpointsSubnetId string = vnet.properties.subnets[1].id
