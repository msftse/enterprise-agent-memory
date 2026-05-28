output "endpoint" {
  description = "Azure OpenAI endpoint URL"
  value       = azurerm_cognitive_account.this.endpoint
}

output "account_name" {
  description = "Azure OpenAI account name"
  value       = azurerm_cognitive_account.this.name
}
