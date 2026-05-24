variable "base_name" {
  type        = string
  description = "Base name for resource naming"
}

variable "location" {
  type        = string
  description = "Azure region"
}

variable "chat_model_name" {
  type        = string
  description = "Chat model deployment name"
  default     = "gpt-4o"
}

variable "embedding_model_name" {
  type        = string
  description = "Embedding model deployment name"
  default     = "text-embedding-3-large"
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group"
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
  default     = {}
}
