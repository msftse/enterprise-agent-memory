output "fqdn" {
  description = "Container App FQDN"
  value       = azurerm_container_app.this.ingress[0].fqdn
}

output "principal_id" {
  description = "System-assigned managed identity principal ID"
  value       = azurerm_container_app.this.identity[0].principal_id
}
