data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

locals {
  common_tags = {
    environment = var.environment
    project     = "enterprise-agent-memory"
    managed_by  = "terraform"
  }
}

# Cosmos DB
module "cosmos" {
  source = "./modules/cosmos"

  base_name           = var.base_name
  location            = data.azurerm_resource_group.main.location
  environment         = var.environment
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = local.common_tags
}

# Azure AI Search
module "ai_search" {
  source = "./modules/ai_search"

  base_name           = var.base_name
  location            = data.azurerm_resource_group.main.location
  environment         = var.environment
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = local.common_tags
}

# Azure OpenAI (conditional)
module "openai" {
  source = "./modules/openai"

  count = var.deploy_openai ? 1 : 0

  base_name            = var.base_name
  location             = data.azurerm_resource_group.main.location
  chat_model_name      = var.chat_model_name
  embedding_model_name = var.embedding_model_name
  resource_group_name  = data.azurerm_resource_group.main.name
  tags                 = local.common_tags
}

# Storage Account
module "storage" {
  source = "./modules/storage"

  base_name           = var.base_name
  location            = data.azurerm_resource_group.main.location
  environment         = var.environment
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = local.common_tags
}

# Monitoring
module "monitoring" {
  source = "./modules/monitoring"

  base_name           = var.base_name
  location            = data.azurerm_resource_group.main.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = local.common_tags
}

# Container App
module "container_app" {
  source = "./modules/container_app"

  base_name                      = var.base_name
  location                       = data.azurerm_resource_group.main.location
  environment                    = var.environment
  resource_group_name            = data.azurerm_resource_group.main.name
  cosmos_endpoint                = module.cosmos.endpoint
  ai_search_endpoint             = module.ai_search.endpoint
  openai_endpoint                = var.deploy_openai ? module.openai[0].endpoint : ""
  storage_account_url            = module.storage.blob_endpoint
  app_insights_connection_string = module.monitoring.connection_string
  tags                           = local.common_tags
}

# --- RBAC Role Assignments ---
# Grant the Container App's managed identity access to all backing services.

# Cosmos DB: ARM-level DocumentDB Account Contributor (metadata operations)
resource "azurerm_role_assignment" "cosmos_account_contributor" {
  scope                = module.cosmos.account_id
  role_definition_name = "DocumentDB Account Contributor"
  principal_id         = module.container_app.principal_id
}

# Cosmos DB: Data-plane SQL role (read/write documents)
resource "azurerm_cosmosdb_sql_role_assignment" "cosmos_data_contributor" {
  resource_group_name = data.azurerm_resource_group.main.name
  account_name        = module.cosmos.account_name
  role_definition_id  = "${module.cosmos.account_id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = module.container_app.principal_id
  scope               = module.cosmos.account_id
}

# AI Search: Search Index Data Contributor (index CRUD + document read/write)
resource "azurerm_role_assignment" "search_index_data_contributor" {
  scope                = module.ai_search.search_id
  role_definition_name = "Search Index Data Contributor"
  principal_id         = module.container_app.principal_id
}

# AI Search: Search Service Contributor (manage indexes, indexers)
resource "azurerm_role_assignment" "search_service_contributor" {
  scope                = module.ai_search.search_id
  role_definition_name = "Search Service Contributor"
  principal_id         = module.container_app.principal_id
}

# Storage: Blob Data Contributor (read/write blobs)
resource "azurerm_role_assignment" "storage_blob_contributor" {
  scope                = module.storage.account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = module.container_app.principal_id
}
