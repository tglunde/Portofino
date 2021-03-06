import {
  Component,
  ContentChild,
  EventEmitter,
  Injectable,
  InjectionToken,
  Input, OnDestroy,
  OnInit, Optional,
  TemplateRef} from "@angular/core";
import {ANNOTATION_REQUIRED, ClassAccessor, loadClassAccessor, Property} from "./class-accessor";
import {FormControl, FormGroup} from "@angular/forms";
import {PortofinoService} from "./portofino.service";
import {HttpClient, HttpHeaders} from "@angular/common/http";
import {Field, FieldSet, Form} from "./form";
import {ActivatedRoute, Router} from "@angular/router";
import {AuthenticationService, NO_AUTH_HEADER} from "./security/authentication.service";
import {declareButton, getButtons} from "./buttons";
import {BehaviorSubject, merge, Observable, of, PartialObserver, Subscription} from "rxjs";
import {catchError, debounceTime, map} from "rxjs/operators";
import {MatDialog, MatDialogRef} from "@angular/material";
import {FlatTreeControl} from "@angular/cdk/tree";
import {CollectionViewer, SelectionChange} from "@angular/cdk/collections";
import {WithButtons} from "./button.component";

export const NAVIGATION_COMPONENT = new InjectionToken('Navigation Component');

@Injectable()
export class PageService {
  page: Page;
  error;
  readonly pageLoad = new EventEmitter<Page | string>();
  readonly pageLoaded = new EventEmitter<Page>();
  readonly pageLoadError = new EventEmitter<any>();

  reset() {
    this.error = null;
    this.page = null;
  }

  loadPage(page: Page | string) {
    this.pageLoad.emit(page);
  }

  notifyPageLoaded(page: Page) {
    this.page = page;
    this.pageLoaded.emit(page);
  }

  notifyError(error) {
    this.error = error;
    this.pageLoadError.emit(error);
  }
}

@Component({
  selector: 'portofino-default-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class DefaultNavigationComponent {
  constructor(public pageService: PageService) {}
}

export class PageConfiguration {
  type: string;
  title: string;
  source: string;
  securityCheckPath: string = ':description';
  children: PageChild[] = [];
  icon?: string;
}

export class PageChild {
  path: string;
  title: string;
  icon: string;
  embedded: boolean;
  showInNavigation: boolean;
  accessible: boolean;
}

class PageFlatNode {
  expandable = true;
  type: string;
  isLoading = false;
  readonly children: PageFlatNode[] = [];
  constructor(public name: string, public path: string, public level: number) {}
}

class PageTreeDataSource {

  readonly dataChange = new BehaviorSubject<PageFlatNode[]>([]);

  get data(): PageFlatNode[] { return this.dataChange.value; }
  set data(value: PageFlatNode[]) {
    this.treeControl.dataNodes = value;
    this.dataChange.next(value);
  }

  constructor(private treeControl: FlatTreeControl<PageFlatNode>, private apiRoot: string, private http: HttpClient) {}

  connect(collectionViewer: CollectionViewer): Observable<PageFlatNode[]> {
    this.treeControl.expansionModel.changed.subscribe(change => {
      if ((change as SelectionChange<PageFlatNode>).added ||
        (change as SelectionChange<PageFlatNode>).removed) {
        this.handleTreeControl(change as SelectionChange<PageFlatNode>);
      }
    });

    return merge(collectionViewer.viewChange, this.dataChange).pipe(map(() => this.data));
  }

  /** Handle expand/collapse behaviors */
  handleTreeControl(change: SelectionChange<PageFlatNode>) {
    if (change.added) {
      change.added.forEach(node => this.toggleNode(node, true));
    }
    if (change.removed) {
      change.removed.slice().reverse().forEach(node => this.toggleNode(node, false));
    }
  }

  /**
   * Toggle the node, remove from display list
   */
  toggleNode(node: PageFlatNode, expand: boolean) {
    const index = this.data.indexOf(node);
    if (!node.expandable || index < 0) {
      return;
    }
    if(expand) {
      if(node.children.length > 0) {
        //Already loaded
        this.data.splice(index + 1, 0, ...node.children);
        this.dataChange.next(this.data);
      } else {
        this.loadNode(node, index);
      }
    } else {
      let count = 0;
      for (let i = index + 1; i < this.data.length
      && this.data[i].level > node.level; i++, count++) {}
      this.data.splice(index + 1, count);
      this.dataChange.next(this.data);
    }
  }

  protected loadNode(node: PageFlatNode, index) {
    node.isLoading = true;
    const url = this.apiRoot + (node.level > 0 ? node.path + '/:description' : ':description');
    this.http.get(url).subscribe((page: any) => {
      if (!page.children || page.children.length == 0) {
        node.expandable = false;
      } else {
        page.children.forEach(child => {
          const childPath = (node.level > 0 ? page.path + '/' + child : child);
          const childPage = new PageFlatNode(child, childPath, node.level + 1);
          node.children.push(childPage);
          this.http.get(this.apiRoot + childPath + '/:description').subscribe((page: any) => {
            childPage.type = page.superclass;
            if (!page.children || page.children.length == 0) {
              childPage.expandable = false;
            }
          });
        });
        this.data.splice(index + 1, 0, ...node.children);
      }
      node.isLoading = false;
      this.dataChange.next(this.data);
    });
  }
}

/*@Component({
  selector: 'portofino-page-source-selector-tree',
  template: `
    <mat-tree [dataSource]="dataSource" [treeControl]="treeControl">
      <mat-tree-node *matTreeNodeDef="let node" matTreeNodeToggle matTreeNodePadding>
        <button mat-icon-button disabled></button>
        <strong style="margin-right: 0.5em;">{{node.name}}</strong>{{node.type ? node.type.substring(node.type.lastIndexOf('.') + 1) : ''}}
        <button mat-icon-button type="button" (click)="select(node)">
          <mat-icon>{{ selected == node ? 'check_circle_outline' : 'done' }}</mat-icon>
        </button>
      </mat-tree-node>

      <mat-tree-node *matTreeNodeDef="let node;when: isExpandable" matTreeNodePadding>
        <button mat-icon-button matTreeNodeToggle
                [attr.aria-label]="'toggle ' + node.name">
          <mat-icon class="mat-icon-rtl-mirror">
            {{treeControl.isExpanded(node) ? 'expand_more' : 'chevron_right'}}
          </mat-icon>
        </button>
        <strong style="margin-right: 0.5em;">{{node.name}}</strong>{{node.type ? node.type.substring(node.type.lastIndexOf('.') + 1) : ''}}
        <button mat-icon-button type="button" (click)="select(node)">
          <mat-icon>{{ selected == node ? 'check_circle_outline' : 'done' }}</mat-icon>
        </button>
        <mat-progress-bar *ngIf="node.isLoading" mode="indeterminate"></mat-progress-bar>
      </mat-tree-node>
    </mat-tree>
    {{ 'Selected:' | translate }} {{selected?.path}}
    <button mat-button color="primary" (click)="confirmAndClose()">{{ 'Ok' | translate }}</button>
    <button mat-button (click)="cancelAndClose()">{{ 'Cancel' | translate }}</button>
  `
})*/
export class SourceSelectorTree implements OnInit {
  treeControl: FlatTreeControl<PageFlatNode>;
  dataSource: PageTreeDataSource;
  selected: PageFlatNode;

  constructor(protected http: HttpClient, public portofino: PortofinoService, protected dialogRef: MatDialogRef<any>) {
    this.treeControl = new FlatTreeControl<PageFlatNode>(this._getLevel, this._isExpandable);
    this.dataSource = new PageTreeDataSource(this.treeControl, this.portofino.apiRoot, this.http);
  }

  ngOnInit(): void {
    this.http.get(this.portofino.apiRoot + ':description').subscribe((page: any) => {
      const root = new PageFlatNode("/", page.path, 0);
      root.type = page.superclass;
      this.dataSource.data = [root];
    });
  }

  confirmAndClose() {
    this.dialogRef.close(this.selected);
  }

  cancelAndClose() {
    this.dialogRef.close();
  }

  private _getLevel = (node: PageFlatNode) => node.level;

  private _isExpandable = (node: PageFlatNode) => { return node.expandable || this.treeControl.isExpanded(node) };

  isExpandable = (_: number, node: PageFlatNode) => { return this._isExpandable(node); };

  select(node) {
    this.selected = node;
  }

}

/*@Component({
  selector: 'portofino-page-source-selector',
  template: `
    <fieldset [formGroup]="form" fxLayout="row wrap" fxLayoutGap="10px" fxLayoutAlign="default center">
      <legend>{{ 'Data source' | translate }}</legend>
      <portofino-field [property]="property" [form]="form"></portofino-field>
      <button mat-flat-button (click)="select()" color="primary" type="button">
        <mat-icon>folder_open</mat-icon>
        {{ 'Select' | translate }}
      </button>
      <!--<mat-checkbox [formControlName]="'relativeToParent'">{{ 'Relative to parent' | translate }}</mat-checkbox>-->
    </fieldset>`
})*/
export class SourceSelector implements OnInit {
  @Input()
  page: Page;
  @Input()
  initialValue: string;
  @Input()
  form: FormGroup;
  readonly property = Property.create({
    name: 'source',
    type: 'string',
    label: 'Path or URL',
    annotations: [{ type: ANNOTATION_REQUIRED, properties: {value: true} }]
  });

  constructor(public portofino: PortofinoService, protected http: HttpClient, protected dialog: MatDialog) {}

  ngOnInit(): void {
    const relativeToParent = new FormControl({
      value: this.page.parent && !this.initialValue.startsWith('/'),
      disabled: !this.page.parent
    });
    const source = new FormControl(this.initialValue);
    source.valueChanges.pipe(debounceTime(1000)).subscribe(value => {
      this.page.configuration.source = value;
      this.page.settingsPanel.reloadConfiguration();
    });
    this.form.addControl('source', source);
    this.form.addControl('relativeToParent', relativeToParent);
    relativeToParent.valueChanges.subscribe(value => {
      this.updateSourceValue(value, source, source.value);
    });
  }

  updateSourceValue(relativeToParent, source, currentValue) {
    const parentSourceUrl = this.page.parent.computeSourceUrl() + '/';
    if (relativeToParent) {
      if(currentValue.startsWith(parentSourceUrl)) {
        source.setValue(currentValue.substring((parentSourceUrl).length));
      }
    } else {
      source.setValue(parentSourceUrl + currentValue);
    }
  }

  select() {
    this.dialog.open(SourceSelectorTree, {
      data: {}
    }).afterClosed().subscribe(value => {
      if(value) {
        this.form.get('source').setValue('/' + value.path);
      }
    });
  }

}

export class PageSettingsPanel {
  active: boolean;
  readonly form = new FormGroup({});
  formDefinition = new Form();
  previousConfiguration;
  permissions: Permissions;
  error;
  readonly accessLevels = ["NONE", "VIEW", "EDIT", "DEVELOP", "DENY"];

  constructor(public page: Page) {}

  show() {
    this.formDefinition.contents = [
      Field.fromProperty({name: 'title', label: 'Title'}, this.page.configuration)];
    this.formDefinition.editable = this.page.portofino.localApiAvailable;
    this.previousConfiguration = this.page.configuration;
    this.reloadConfiguration();
    this.loadPermissions();
    this.active = true;
  }

  loadPermissions() {
    const permissionsUrl = this.page.computeSourceUrl() + this.page.permissionsPath;
    this.page.http.get<Permissions>(permissionsUrl).subscribe(p => {
      this.permissions = p;
      this.permissions.groups.forEach(g => {
        if (!g.level) {
          g.level = "inherited";
        }
        g.permissionMap = {};
        g.permissions.forEach(p => {
          g.permissionMap[p] = true;
        });
      });
    });
  }

  hide() {
    this.active = false;
  }

  get groups() {
    return this.permissions.groups.sort((g1, g2) => g1.name.localeCompare(g2.name));
  }

  protected setupConfigurationForm(ca: ClassAccessor, config: any) {
    const index = this.formDefinition.contents.findIndex(f => f['name'] == 'configuration');
    if(index >= 0) {
      this.formDefinition.contents.splice(index, 1);
    }
    if(ca) {
      const fieldSet = FieldSet.fromClassAccessor(ca, {
        name: 'configuration', label: 'Configuration', object: config, properties: this.page.configurationProperties
      });
      this.formDefinition.contents.push(fieldSet);
    }
    this.formDefinition = {...this.formDefinition}; //To cause the form component to reload the form
  }

  reloadConfiguration() {
    this.page.loadConfiguration().subscribe(conf => {
      this.page.http.get<ClassAccessor>(this.page.configurationUrl + '/classAccessor')
        .pipe(loadClassAccessor)
        .subscribe(ca => {
        this.setupConfigurationForm(ca, conf);
      }, error => {
        this.setupConfigurationForm(null, null);
        this.error = error;
      })
      //this.page.settingsPanel.refreshConfiguration(); TODO
    });
  }
}

export abstract class Page implements WithButtons, OnDestroy {

  @Input()
  configuration: PageConfiguration & any;
  readonly settingsPanel = this.getPageSettingsPanel();
  path: string;
  baseUrl: string;
  url: string;
  segment: string;
  parent: Page;
  allowEmbeddedComponents: boolean = true;
  embedded = false;

  readonly operationsPath = '/:operations';
  readonly configurationPath = '/:configuration';
  readonly permissionsPath = '/:permissions';
  readonly page = this;

  protected readonly subscriptions: Subscription[] = [];

  constructor(
    public portofino: PortofinoService, public http: HttpClient, protected router: Router,
    @Optional() protected route: ActivatedRoute, public authenticationService: AuthenticationService) {
    //Declarative approach does not work for some reason:
    //"Metadata collected contains an error that will be reported at runtime: Lambda not supported."
    //TODO investigate with newer versions
    declareButton({
      color: 'primary', icon: 'save', text: 'Save', list: 'configuration'
    }, this, 'saveConfiguration', null);
    declareButton({
      icon: 'arrow_back', text: 'Cancel', list: 'configuration'
    }, this, 'cancelConfiguration', null);
    declareButton({
      color: 'primary', icon: 'save', text: 'Save', list: 'permissions'
    }, this, 'savePermissions', null);
    declareButton({
      icon: 'arrow_back', text: 'Cancel', list: 'permissions'
    }, this, 'cancelPermissions', null);
    declareButton({
      color: 'primary', icon: 'save', text: 'Save', list: 'children', enabledIf: () => this.portofino.localApiAvailable
    }, this, 'saveChildren', null);
    declareButton({
      icon: 'arrow_back', text: 'Cancel', list: 'children'
    }, this, 'cancelChildren', null);
  }

  initialize() {}

  protected getPageSettingsPanel() {
    return new PageSettingsPanel(this);
  }

  subscribe<T>(
    observable: Observable<T>, observer: PartialObserver<T> | ((value: T) => void),
    error?: (error: any) => void, complete?: () => void): Subscription {
    let subscription;
    if(observer instanceof Function) {
      subscription = observable.subscribe(observer as (value: T) => void, error, complete);
    } else {
      subscription = observable.subscribe(observer as PartialObserver<T>);
    }
    this.subscriptions.push(subscription);
    return subscription;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

  consumePathSegment(fragment: string): boolean {
    return true;
  }

  get root(): Page {
    if(this.parent) {
      return this.parent.root;
    } else {
      return this;
    }
  }

  get children(): PageChild[] {
    return this.configuration[this.childrenProperty] || []
  }

  get childrenProperty(): string {
    return "children";
  }

  get embeddedChildren() {
    return this.children.filter(c => this.allowEmbeddedComponents && c.embedded && c.accessible);
  }

  get title() {
    let title = this.configuration.title;
    if(!title && this.parent) {
      let pageChild = this.parent.children.find(c => c.path == this.segment);
      if(pageChild) {
        title = pageChild.title;
      }
    }
    return title;
  }

  get icon() {
    if(this.parent) {
      let pageChild = this.parent.children.find(c => c.path == this.segment);
      return pageChild ? pageChild.icon : null;
    } else {
      return null;
    }
  }

  getChild(segment: string) {
    return this.children.find(c => c.path == segment);
  }

  getButtons(list = 'default') {
    return getButtons(this, list);
  }

  prepare(): Observable<Page> {
    return this.checkAccess(true).pipe<Page>(map(() => this));
  }

  checkAccess(askForLogin: boolean): Observable<any> {
    let headers = new HttpHeaders();
    if(!askForLogin) {
      headers = headers.set(NO_AUTH_HEADER, 'true');
    }
    let sourceUrl = this.computeSourceUrl();
    const securityCheckPath = (this.configuration.securityCheckPath || ':description');
    if(!sourceUrl.endsWith('/') && !securityCheckPath.startsWith('/')) {
      sourceUrl += '/';
    } else if(sourceUrl.endsWith('/') && securityCheckPath.startsWith('/')) {
      sourceUrl = sourceUrl.substring(0, sourceUrl.length - 1);
    }
    return this.http.get<any>(
      sourceUrl + securityCheckPath,
      { headers: headers });
  }

  get accessPermitted(): Observable<boolean> {
    return this.checkAccess(false).pipe(map(() => true), catchError(() => of(false)));
  }

  computeSourceUrl() {
    let source = this.configuration.source || '';
    if(source.startsWith('http://') || source.startsWith('https://')) {
      //Absolute, leave as is
    } else if(!source.startsWith('/')) {
      if(this.parent) {
        source = this.parent.computeSourceUrl() + '/' + source;
      } else {
        source = this.portofino.apiRoot + '/' + source;
      }
    } else {
      source = this.portofino.apiRoot + source;
    }
    //replace double slash, but not in http(s)://
    source = source.replace(new RegExp("([^:])//"), '$1/');
    while (source.endsWith("/"))  {
      source = source.substring(0, source.length - 1);
    }
    return source;
  }

  operationAvailable(ops: Operation[], signature: string) {
    return ops.some(op => op.signature == signature && op.available);
  }

  loadPageConfiguration(path: string) {
    return this.http.get<PageConfiguration>(this.getConfigurationLocation(path));
  }

  getConfigurationLocation(path: string = this.path) {
    //replace double slash, but not in http(s)://
    return `pages${path}/config.json`.replace(new RegExp("([^:])//"), '$1/');
  }

  configure() {
    this.settingsPanel.show();
  }

  saveConfiguration() {
    const actionConfiguration = this.getActionConfigurationToSave();
    const path = this.getConfigurationLocation(this.path);
    if (this.portofino.localApiAvailable) {
      const pageConfiguration = this.getPageConfigurationToSave(this.settingsPanel.form.value);
      this.configuration = pageConfiguration;
      let data = new FormData();
      data.append("pageConfiguration", JSON.stringify(pageConfiguration));
      data.append("actionConfiguration", JSON.stringify(actionConfiguration));
      this.http.put(`${this.portofino.localApiPath}/${path}`, data, {
        params: {
          actionConfigurationPath: this.configurationUrl,
          loginPath: this.portofino.loginPath
        }
      }).subscribe(() => {
        this.settingsPanel.hide();
        this.reloadBaseUrl();
      });
    } else {
      this.http.put(`${this.configurationUrl}`, actionConfiguration).subscribe(() => {
        this.settingsPanel.hide();
        this.reloadBaseUrl();
      });
    }
  }

  cancelConfiguration() {
    this.configuration = this.settingsPanel.previousConfiguration;
    this.settingsPanel.hide();
  }

  protected reloadBaseUrl() {
    if (this.router.url && this.router.url != "/") {
      this.router.navigateByUrl(this.baseUrl);
    } else {
      //this.router.navigate(['.'], {relativeTo: this.route});
      window.location.reload(); //TODO
    }
  }

  get configurationUrl() {
    return this.computeSourceUrl() + this.configurationPath;
  }

  public loadConfiguration() {
    return this.http.get(this.configurationUrl).pipe(map(c => {
      this.configuration = {...c, ...this.configuration};
      return c;
    }));
  }

  //TODO refactor into page settings panel
  protected getPageConfigurationToSave(formValue) {
    const config = Object.assign({}, this.configuration, formValue);
    const pageConfiguration = new PageConfiguration();
    //Reflection would be nice
    pageConfiguration.children = config.children;
    pageConfiguration.securityCheckPath = config.securityCheckPath;
    pageConfiguration.source = config.source;
    pageConfiguration.title = config.title;
    pageConfiguration.type = config.type;
    return pageConfiguration;
  }

  protected getActionConfigurationToSave() {
    return this.settingsPanel.form.get('configuration').value;
  }

  get configurationProperties() {
    return null;
  }

  savePermissions() {
    const permissionsUrl = this.computeSourceUrl() + this.permissionsPath;
    this.settingsPanel.groups.forEach(g => {
      if(g.level == "inherited") {
        g.level = null;
      }
      g.permissions = [];
      for(let p in g.permissionMap) {
        if(g.permissionMap[p]) {
          g.permissions.push(p);
        }
      }
      delete g.permissionMap;
    });
    this.http.put(permissionsUrl, this.settingsPanel.groups).subscribe(() => {
      this.settingsPanel.hide();
    });
  }

  cancelPermissions() {
    this.settingsPanel.hide();
  }

  saveChildren() {
    if (!this.portofino.localApiAvailable) {
      throw "Local Portofino API not available"
    }
    const pageConfiguration = this.getPageConfigurationToSave({});
    this.configuration = pageConfiguration;
    let data = new FormData();
    data.append("pageConfiguration", JSON.stringify(pageConfiguration));
    const path = this.getConfigurationLocation(this.path);
    this.http.put(`${this.portofino.localApiPath}/${path}`, data, {
      params: { loginPath: this.portofino.loginPath }}).subscribe(
      () => {
        this.settingsPanel.hide();
        this.reloadBaseUrl();
      });
  }

  cancelChildren() {
    this.settingsPanel.hide();
  }
}

@Component({
  selector: 'portofino-page-header',
  templateUrl: './page-header.component.html',
  styleUrls: ['./page-header.component.css']
})
export class PageHeader {
  @Input()
  page: Page;
  constructor(public authenticationService: AuthenticationService, public portofino: PortofinoService) {}
}

@Component({
  selector: 'portofino-default-page-layout',
  templateUrl: './default-page-layout.component.html',
  styleUrls: ['./default-page-layout.component.css']
})
export class DefaultPageLayout {
  @Input()
  page: Page;
  @ContentChild("content")
  content: TemplateRef<any>;
  @ContentChild("extraConfiguration")
  extraConfiguration: TemplateRef<any>;
}

export class Operation {
  name: string;
  signature: string;
  parameters: string[];
  available: boolean;
}

export class Permissions {
  groups: Group[];
  permissions: string[];
}

export class Group {
  name: string;
  level: string;
  actualAccessLevel: string;
  permissions: string[];
  permissionMap: {[name: string]: boolean};
}
