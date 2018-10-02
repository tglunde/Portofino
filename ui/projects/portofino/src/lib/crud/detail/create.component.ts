import {Component, OnInit} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {PortofinoService} from "../../portofino.service";
import {isInsertable, Property} from "../../class-accessor";
import {BaseDetailComponent} from "../common.component";

@Component({
  selector: 'portofino-crud-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.css']
})
export class CreateComponent extends BaseDetailComponent implements OnInit {

  constructor(protected http: HttpClient, protected portofino: PortofinoService) {
    super(http, portofino);
  }

  isEditable(property: Property): boolean {
    return isInsertable(property);
  }

  isEditEnabled(): boolean {
    return true;
  }

  ngOnInit() {
    this.initClassAccessor();
    this.http.get(this.sourceUrl, {params: {newObject: "true"}}).subscribe(o => this.setupForm(o));
  }

  cancel() {
    this.close.emit();
  }

  save() {
    if(this.form.invalid) {
      this.triggerValidationForAllFields(this.form);
      return;
    }
    let object = this.getObjectToSave();
    this.http.post(this.sourceUrl, object).subscribe(() => this.close.emit(object));
  }

}