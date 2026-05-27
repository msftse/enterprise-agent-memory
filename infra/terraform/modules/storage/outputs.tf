output "blob_endpoint" {
  description = "Blob Storage primary endpoint"
  value       = azurerm_storage_account.this.primary_blob_endpoint
}

output "account_name" {
  description = "Storage account name"
  value       = azurerm_storage_account.this.name
}

output "account_id" {
  description = "Storage account resource ID"
  value       = azurerm_storage_account.this.id
}
