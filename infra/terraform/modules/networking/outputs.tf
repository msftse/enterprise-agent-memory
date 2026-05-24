output "vnet_id" {
  description = "Virtual network resource ID"
  value       = azurerm_virtual_network.this.id
}

output "container_apps_subnet_id" {
  description = "Container Apps subnet resource ID"
  value       = azurerm_subnet.container_apps.id
}

output "private_endpoints_subnet_id" {
  description = "Private endpoints subnet resource ID"
  value       = azurerm_subnet.private_endpoints.id
}
