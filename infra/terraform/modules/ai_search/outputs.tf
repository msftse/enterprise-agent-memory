output "endpoint" {
  description = "Azure AI Search endpoint URL"
  value       = "https://${azurerm_search_service.this.name}.search.windows.net"
}

output "search_name" {
  description = "Azure AI Search service name"
  value       = azurerm_search_service.this.name
}

output "search_id" {
  description = "Azure AI Search service resource ID"
  value       = azurerm_search_service.this.id
}
