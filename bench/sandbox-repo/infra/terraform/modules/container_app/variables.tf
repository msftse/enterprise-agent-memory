variable "base_name" {
  type        = string
  description = "Base name for resource naming"
}

variable "location" {
  type        = string
  description = "Azure region"
}

variable "environment" {
  type        = string
  description = "Environment (dev, staging, prod)"
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group"
}

variable "cosmos_endpoint" {
  type        = string
  description = "Cosmos DB endpoint URL"
}

variable "ai_search_endpoint" {
  type        = string
  description = "Azure AI Search endpoint URL"
}

variable "openai_endpoint" {
  type        = string
  description = "Azure OpenAI endpoint URL (empty if not deployed)"
  default     = ""
}

variable "storage_account_url" {
  type        = string
  description = "Blob Storage endpoint URL"
}

variable "app_insights_connection_string" {
  type        = string
  description = "Application Insights connection string"
  sensitive   = true
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
  default     = {}
}
