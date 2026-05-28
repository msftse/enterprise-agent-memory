variable "subscription_id" {
  type        = string
  description = "Azure subscription ID"
}

variable "base_name" {
  type        = string
  description = "Base name for all resources"
}

variable "location" {
  type        = string
  description = "Azure region for all resources"
  default     = "westus2"
}

variable "environment" {
  type        = string
  description = "Environment (dev, staging, prod)"
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "deploy_openai" {
  type        = bool
  description = "Deploy Azure OpenAI (requires quota approval)"
  default     = false
}

variable "chat_model_name" {
  type        = string
  description = "Azure OpenAI chat model deployment name"
  default     = "gpt-4o"
}

variable "embedding_model_name" {
  type        = string
  description = "Azure OpenAI embedding model deployment name"
  default     = "text-embedding-3-large"
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group (must already exist)"
}
