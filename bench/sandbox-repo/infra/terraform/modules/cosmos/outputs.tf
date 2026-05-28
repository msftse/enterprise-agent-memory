output "endpoint" {
  description = "Cosmos DB account document endpoint"
  value       = azurerm_cosmosdb_account.this.endpoint
}

output "account_name" {
  description = "Cosmos DB account name"
  value       = azurerm_cosmosdb_account.this.name
}

output "account_id" {
  description = "Cosmos DB account resource ID"
  value       = azurerm_cosmosdb_account.this.id
}
