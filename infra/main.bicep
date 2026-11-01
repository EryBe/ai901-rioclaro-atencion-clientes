targetScope = 'resourceGroup'

@description('Name of the existing Linux App Service.')
param appServiceName string

@description('Existing App Service plan resource ID.')
param appServicePlanId string

@description('Existing App Service and resource-group location.')
param location string

@description('Existing Application Insights resource ID linked to the App Service.')
param appInsightsResourceId string

@description('Name of the existing Azure AI Services account.')
param foundryAccountName string

@description('Name of the existing Foundry project.')
param foundryProjectName string

@description('Azure built-in role definition ID for Foundry User.')
param foundryUserRoleDefinitionId string = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '53ca6127-db72-4b80-b1b0-d745d6d5456d'
)

resource appService 'Microsoft.Web/sites@2024-04-01' = {
  name: appServiceName
  location: location
  tags: {
    'hidden-link: /app-insights-resource-id': appInsightsResourceId
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: {
      localMySqlEnabled: false
      linuxFxVersion: 'NODE|22-lts'
      netFrameworkVersion: 'v4.0'
    }
  }
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' existing = {
  parent: foundryAccount
  name: foundryProjectName
}

resource foundryUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryProject.id, appService.id, foundryUserRoleDefinitionId)
  scope: foundryProject
  properties: {
    roleDefinitionId: foundryUserRoleDefinitionId
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output appServicePrincipalId string = appService.identity.principalId
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
