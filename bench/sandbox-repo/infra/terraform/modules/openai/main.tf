locals {
  openai_name = "oai-${var.base_name}"
}

resource "azurerm_cognitive_account" "this" {
  name                  = local.openai_name
  location              = var.location
  resource_group_name   = var.resource_group_name
  kind                  = "OpenAI"
  sku_name              = "S0"
  custom_subdomain_name = local.openai_name
  tags                  = var.tags
}

resource "azurerm_cognitive_deployment" "chat" {
  name                 = var.chat_model_name
  cognitive_account_id = azurerm_cognitive_account.this.id

  model {
    format  = "OpenAI"
    name    = var.chat_model_name
    version = "2024-11-20"
  }

  sku {
    name     = "Standard"
    capacity = 30
  }
}

resource "azurerm_cognitive_deployment" "embedding" {
  name                 = var.embedding_model_name
  cognitive_account_id = azurerm_cognitive_account.this.id

  model {
    format  = "OpenAI"
    name    = var.embedding_model_name
    version = "1"
  }

  sku {
    name     = "Standard"
    capacity = 120
  }

  depends_on = [azurerm_cognitive_deployment.chat]
}
