import '../../assets/sass/_explorer.sass';
import './_template-explorer.sass';
import templateUrl from './template-explorer.html';

export const TemplateExplorerComponent = {
  controller: ComponentController,
  controllerAs: 'vm',
  templateUrl,
};

/** @ngInject */
function ComponentController(ListView, TemplatesService, EventNotifications, $state, sprintf, Session, Polling, POLLING_INTERVAL) {
  const vm = this;
  vm.permissions = TemplatesService.getPermissions();
  vm.$onInit = activate();
  vm.$onDestroy = function() {
    Polling.stop('templateListPolling');
  };

  function activate() {
    angular.extend(vm, {
      currentUser: Session.currentUser(),
      confirmDelete: false,
      cancelRemoveTemplate: cancelRemoveTemplate,
      loading: false,
      templates: [],
      limit: 20,
      filterCount: 0,
      filters: [],
      templatesList: [],
      templatesToDelete: [],
      selectedItemsList: [],
      limitOptions: [5, 10, 20, 50, 100, 200, 500, 1000],
      selectedItemsListCount: 0,
      resolveTemplates: resolveTemplates,
      removeTemplate: removeTemplate,
      updatePagination: updatePagination,
      actionConfig: getToolbarMenus(),
      menuActions: getMenuActions(),
      toolbarConfig: getToolbarConfig(),
      listConfig: getListConfig(),
      listActionDisable: listActionDisable,
      sortConfig: getSortConfig(),
      offset: 0,
      pollingInterval: POLLING_INTERVAL,
    });

    resolveTemplates(vm.limit, 0);
    Polling.start('templateListPolling', pollTemplates, vm.pollingInterval);
  }

  function getToolbarMenus() {
    const menus = [];
    const configurationMenu = {
      title: __('Configuration'),
      name: __('Configuration'),
      actionName: 'configuration',
      icon: 'fa fa-cog',
      isDisabled: false,
      actions: [],
    };

    const menuActions = [{
      name: __('Create'),
      actionName: 'create',
      title: __('Create new template'),
      actionFn: addTemplate,
      isDisabled: false,
      permissions: vm.permissions.create,
    },
    {
      name: __('Copy'),
      actionName: 'copy',
      title: __('Copy template'),
      actionFn: copyTemplate,
      isDisabled: false,
      permissions: vm.permissions.copy,
    },
    {
      name: __('Edit'),
      actionName: 'edit',
      title: __('Edit template'),
      actionFn: editTemplate,
      isDisabled: false,
      permissions: vm.permissions.edit,
    },
    {
      name: __('Delete'),
      actionName: 'delete',
      title: __('Delete template'),
      actionFn: deleteSelectedTemplates,
      isDisabled: false,
      permissions: vm.permissions.delete,
    }];

    angular.forEach(menuActions, hasPermission);
    function hasPermission(item) {
      if (item.permissions) {
        configurationMenu.actions.push(item);
      }
    }
    menus.push(configurationMenu);

    return menus;
  }

  function getListConfig() {
    return {
      useExpandingRows: false,
      selectionMatchProp: 'id',
      onCheckBoxChange: selectionChange,
    };
  }

  function getSortConfig() {
    return {
      direction: 'asc',
      field: 'name',
      sortOptions: 'alpha',
    };
  }

  function getToolbarConfig() {
    const sortOrderFields = getSortFields();
    const sortConfig = {
      fields: sortOrderFields,
      onSortChange: sortChange,
      isAscending: true,
      currentField: sortOrderFields[0],
    };

    const filterConfig = {
      fields: getFilterFields(),
      resultsCount: 0,
      appliedFilters: [],
      onFilterChange: filterChange,
    };

    return {
      sortConfig: sortConfig,
      filterConfig: filterConfig,
      actionsConfig: {
        actionsInclude: true,
      },
    };
  }

  function getFilterFields() {
    return [
      ListView.createFilterField('name', __('Name'), __('Filter by Name'), 'text'),
      ListView.createFilterField('type', __('Type'), __('Filter by Type'), 'text'),
      ListView.createFilterField('draft', __('Draft'), __('Filter by Draft'), 'text'),
    ];
  }

  function getSortFields() {
    return [
      ListView.createSortField('name', __('Name'), 'alpha'),
      ListView.createSortField('type', __('Type'), 'alpha'),
    ];
  }

  function getMenuActions() {
    const menuActions = [];
    const menuActionsConfig = [
      {
        name: __('Copy'),
        title: __('Copy Template'),
        actionFn: handleCopy,
        permissions: vm.permissions.copy,
      },
      {
        name: __('Edit'),
        title: __('Edit Template'),
        actionFn: handleEdit,
        permissions: vm.permissions.edit,
      },
      {
        name: __('Delete'),
        title: __('Delete Template'),
        actionFn: handleDelete,
        permissions: vm.permissions.delete,
      },
    ];

    angular.forEach(menuActionsConfig, function(menuItem) {
      if (menuItem.permissions) {
        menuActions.push(menuItem);
      }
    });

    return menuActions;
  }
  function listActionDisable(config, items) {
    const menuCreate = 0;
    const menuCopy = 1;
    const menuEdit = 2;
    const menuDelete = 3;

    switch (config.actionName) {
      case 'configuration':
        config.actions[menuCreate].isDisabled = items.length > 0;
        config.actions[menuCopy].isDisabled = items.length !== 1;
        config.actions[menuEdit].isDisabled = items.length !== 1;
        config.actions[menuDelete].isDisabled = items.length === 0;
        break;
    }
  }
  function sortChange(sortId, direction) {
    vm.sortConfig.field = sortId.id;
    vm.sortConfig.direction = direction === true ? 'asc' : 'desc';
    vm.sortConfig.sortOptions = sortId.sortType === 'alpha' ? 'ignore_case' : '';

    resolveTemplates(vm.limit, 0);
  }

  function filterChange(filters) {
    vm.filters = filters;
    resolveTemplates(vm.limit, 0);
  }

  function resolveTemplates(limit, offset, refresh) {
    if (!refresh) {
      vm.loading = true;
    }
    vm.offset = String(offset);

    TemplatesService.getMinimal(vm.filters).then(setResultTotals);
    TemplatesService.getTemplates(limit, vm.offset, vm.filters, vm.sortConfig)
      .then(querySuccess)
      .catch(queryFailure);

    function querySuccess(response) {
      vm.loading = false;
      vm.toolbarConfig.filterConfig.resultsCount = vm.filterCount;
      vm.templates = response.resources;
      vm.templatesList = [];
      angular.forEach(vm.templates, processTemplates);

      function processTemplates(template) {
        switch (template.type) {
          case 'OrchestrationTemplateAzure':
            template.logo = 'images/providers/vendor-azure.svg';
            break;
          case 'OrchestrationTemplateCfn':
            template.logo = 'images/providers/vendor-amazon.svg';
            break;
          case 'OrchestrationTemplateHot':
          case 'OrchestrationTemplateVnfd':
            template.logo = 'pictures/10r16.jpg';
            break;
          case 'OrchestrationTemplateVapp':
            template.logo = 'images/providers/vendor-vmware_cloud.svg';
            break;
          default:
            template.logo = 'images/service.png';
            break;
        }

        template.selected = false;

        vm.selectedItemsList.some(function(selectedItem) {
          if (selectedItem.id === template.id) {
            if (angular.isDefined(selectedItem.selected) && selectedItem.selected) {
              template.selected = true;
            }

            return true;
          }
        });
        vm.templatesList.push(template);
      }
    }

    function queryFailure(_error) {
      vm.loading = false;
      EventNotifications.error(__('There was an error loading templates.'));
    }
  }

  function selectionChange(_item) {
    vm.selectedItemsList = vm.templatesList.filter(function(service) {
      return service.selected;
    });
  }

  function updatePagination(limit, offset) {
    vm.limit = limit;
    vm.offset = offset;
    vm.resolveTemplates(limit, offset);
  }

  function setResultTotals(response) {
    vm.requestCount = response.subcount;
    vm.filterCount = response.subcount;
    vm.toolbarConfig.filterConfig.resultsCount = vm.requestCount;
  }

  function pollTemplates() {
    resolveTemplates(vm.limit, vm.offset, true);
  }

  function addTemplate() {
    $state.go("templates.editor", { pageAction: 'add'});
  }

  function handleEdit(_action, template) {
    editTemplate(template);
  }

  function handleCopy(_action, template) {
    $state.go('templates.editor', { templateId: template.id, pageAction: 'copy' });
  }

  function copyTemplate(template) {
    template = vm.selectedItemsList[0];
    handleCopy("", template);
  }

  function editTemplate(template) {
    if (angular.isUndefined(template.id)) {
      template = vm.selectedItemsList[0];
    }
    $state.go('templates.editor', { templateId: template.id, pageAction: 'edit' });
  }
  function removeTemplate() {
    const deleteTemplates = [];

    if (vm.templatesToDelete.length > 0) {
      vm.templatesToDelete.forEach((template) => { deleteTemplates.push({id: template.id}); });
    } else if (vm.templatesToDelete) {
      deleteTemplates.push({id: vm.templatesToDelete.id});
    }

    if (deleteTemplates.length > 0) {
      TemplatesService.deleteTemplates(deleteTemplates).then(removeSuccess,
        removeFailure);
    }
    vm.confirmDelete = false;
    vm.templatesToDelete = [];

    function removeSuccess() {
      EventNotifications.success(__('Templates deleted successfully.'));
      resolveTemplates(vm.limit, 0);
    }

    function removeFailure() {
      EventNotifications.error(__('There was an error deleting templates.'));
      resolveTemplates(vm.limit, 0);
    }
  }

  function cancelRemoveTemplate() {
    vm.templatesToDelete = [];
    vm.confirmDelete = false;
  }

  function handleDelete(_action, template) {
    vm.templatesToDelete = template;
    vm.confirmDelete = true;
    vm.deleteConfirmationMessage = sprintf(__('Are you sure you want to delete template %s?'),
      vm.templatesToDelete.name);
  }

  function deleteSelectedTemplates() {
    vm.templatesToDelete.splice(0, vm.templatesToDelete.length);

    vm.selectedItemsList.forEach((selected) => { vm.templatesToDelete.push(selected); });

    vm.confirmDelete = true;
    vm.deleteConfirmationMessage = sprintf(__('Are you sure you want to delete %d templates?'),
      vm.templatesToDelete.length);
  }
}
