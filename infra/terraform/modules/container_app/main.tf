locals {
  env_name = "env-${var.base_name}-${var.environment}"
  app_name = "app-${var.base_name}-${var.environment}"
}

resource "azurerm_container_app_environment" "this" {
  name                = local.env_name
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_container_app" "this" {
  name                         = local.app_name
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.environment == "prod" ? 1 : 0
    max_replicas = 10

    container {
      name   = "agent-memory"
      image  = "mcr.microsoft.com/k8se/quickstart:latest" # placeholder — replace with ACR image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }

      env {
        name  = "COSMOS_ENDPOINT"
        value = var.cosmos_endpoint
      }

      env {
        name  = "COSMOS_DATABASE"
        value = "agentmemory"
      }

      env {
        name  = "AI_SEARCH_ENDPOINT"
        value = var.ai_search_endpoint
      }

      env {
        name  = "AI_SEARCH_INDEX"
        value = "agent-memory"
      }

      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = var.openai_endpoint
      }

      env {
        name  = "STORAGE_ACCOUNT_URL"
        value = var.storage_account_url
      }

      env {
        name  = "AUTH_DISABLED"
        value = var.environment == "dev" ? "true" : "false"
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = var.app_insights_connection_string
      }
    }
  }
}
