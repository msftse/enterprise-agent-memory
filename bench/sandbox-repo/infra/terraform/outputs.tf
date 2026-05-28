output "container_app_url" {
  description = "FQDN of the deployed Container App"
  value       = module.container_app.fqdn
}

output "cosmos_endpoint" {
  description = "Cosmos DB account endpoint"
  value       = module.cosmos.endpoint
}

output "ai_search_endpoint" {
  description = "Azure AI Search endpoint"
  value       = module.ai_search.endpoint
}

output "openai_endpoint" {
  description = "Azure OpenAI endpoint (empty if not deployed)"
  value       = var.deploy_openai ? module.openai[0].endpoint : "not-deployed"
}

output "storage_account_url" {
  description = "Blob Storage endpoint"
  value       = module.storage.blob_endpoint
}
