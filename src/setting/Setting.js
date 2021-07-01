define([
        'dojo/_base/declare',
        'dojo/_base/lang',
        'dojo/_base/array',
        'dojo/request',
        'dojo/dom',
        'dojo/on',
        'dojo/store/Memory',
        'dijit/form/FilteringSelect',
        'dijit/_WidgetsInTemplateMixin',
        'jimu/BaseWidgetSetting',
        './commonmark',
        './xml2json',
    ], function(declare, lang, dojoArray, dRequest, dom, on, Memory, FilteringSelect, _WidgetsInTemplateMixin, BaseWidgetSetting, commonmark, xml2json) {

        return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {
            baseClass: 'jimu-widget-streetsmartwidget-setting',

            postCreate:function() {
                this.inherited(arguments);
                this.getSrsData();
                if(this.config) {
                    this.setConfig(this.config);
                } else {
                    this.getConfig();
                }
            },
            startup: function() {
                let self = this;
                on(dom.byId('userAgreementLink'), 'click', function(){
                    let agreementDataNode = dom.byId('agreementData');
                    let agreementPane = dom.byId('agreementContainer');
                    self.getConfig();
                    let settingLocale = dojoConfig.locale;
                    let url = self.folderUrl + 'setting/agreementCMT/agreement_' + settingLocale + '.txt';
                    require(['dojo/text!' + url], function(text) {
                        let reader = new commonmark.Parser();
                        let writer = new commonmark.HtmlRenderer();
                        let parsed = reader.parse(text);
                        let result = writer.render(parsed);
                        agreementDataNode.innerHTML = result;
                        agreementPane.style.display = 'block';
                    });
                });
                on(dom.byId('toggleAll'), 'click', function(){
                    require(["dojo/query", "dojo/NodeList-dom"], function(query){
                        query('input[type="checkbox"]').forEach(function(node){
                            node.checked = dom.byId('toggleAll').checked;
                        });
                    });
                });

            },

            setConfig:function(config) {

                this.config = config;

                if(this.config.locale){
                    this.selectCyclomediaLocation.set("value", this.config.locale);
                }

                if(this.config.units){
                    this.selectUnitToggle.set("value", this.config.units);
                }

                if(this.config.uName){
                    this.uNameCyclomedia.value = this.config.uName;
                }

                if(this.config.uPwd){
                    this.uPwdCyclomedia.value = this.config.uPwd;
                }

                if(this.config.agreement){
                    this.agreementCheck.value = this.config.agreement;
                    if(this.config.agreement === true){
                        this.agreementCheck.checked = true;
                    }
                }
                if(this.config.saveMeasurements){
                    this.saveMeasurementsEnabled.value = this.config.saveMeasurements;
                    if(this.config.saveMeasurements === true){
                        this.saveMeasurementsEnabled.checked = true;
                    }
                }

                if(this.config.overlays){
                    this.overlaysEnabled.value = this.config.overlays;
                    if(this.config.overlays === true){
                        this.overlaysEnabled.checked = true;
                    }
                }

                if(this.config.linkMapMove){
                    this.linkMapMove.value = this.config.linkMapMove;
                    if(this.config.linkMapMove === true){
                        this.linkMapMove.checked = true;
                    }
                }

                if(this.config.allowEditing){
                    this.allowEditing.value = this.config.allowEditing;
                    if(this.config.allowEditing === true){
                        this.allowEditing.checked = true;
                    }
                }

                if(this.config.srs){
                    this.srsCyclomedia.value = this.config.srs;
                }

                if(this.config.navigation){
                    this.navigationEnable.value = this.config.navigation;
                    if(this.config.navigation === true) {
                        this.navigationEnable.checked = true;
                    }
                }

                if(this.config.timetravel){
                    this.timetravelEnable.value = this.config.timetravel;
                    if(this.config.timetravel === true) {
                        this.timetravelEnable.checked = true;
                    }
                }

                if(this.config.showStreetName){
                    this.enableStreetname.value = this.config.showStreetName;
                    if(this.config.showStreetName === true) {
                        this.enableStreetname.checked = true;
                    }
                }

                if(this.config.buttonVisibility){
                    const bv = this.config.buttonVisibility;
                    if(bv.OVERLAYS !== undefined) this.overlaysButtonEnable.checked = !!bv.OVERLAYS;
                    if(bv.ELEVATION !== undefined) this.elevationButtonEnable.checked = !!bv.ELEVATION;
                    if(bv.REPORT_BLURRING !== undefined) this.reportblurringButtonEnable.checked = !!bv.REPORT_BLURRING;
                    if(bv.MEASURE !== undefined) this.measureButtonEnable.checked = !!bv.MEASURE;
                    if(bv.SAVE_IMAGE !== undefined) this.saveimageButtonEnable.checked = !!bv.SAVE_IMAGE;
                    if(bv.IMAGE_INFORMATION !== undefined) this.imageinformationButtonEnable.checked = !!bv.IMAGE_INFORMATION;
                    if(bv.ZOOM_IN !== undefined) this.zoominButtonEnable.checked = !!bv.ZOOM_IN;
                    if(bv.ZOOM_OUT !== undefined) this.zoomoutButtonEnable.checked = !!bv.ZOOM_OUT;
                }
            },

            getConfig: function () {
                this.config.locale = this.selectCyclomediaLocation.value;
                this.config.units = this.selectUnitToggle.value;
                this.config.uName = this.uNameCyclomedia.value;
                this.config.uPwd = this.uPwdCyclomedia.value;
                this.config.agreement = this.agreementCheck.checked;
                this.config.saveMeasurements = this.saveMeasurementsEnabled.checked;
                this.config.overlays = this.overlaysEnabled.checked;
                this.config.linkMapMove = this.linkMapMove.checked;
                this.config.allowEditing = this.allowEditing.checked;
                this.config.srs = dijit.byId('srsComboBox') && dijit.byId('srsComboBox').value || document.getElementById('srsComboBox').value;
                this.config.navigation = this.navigationEnable.checked;
                this.config.timetravel = this.timetravelEnable.checked;
                this.config.showStreetName = this.enableStreetname.checked;
                this.config.buttonVisibility = {
                    OVERLAYS: this.overlaysButtonEnable.checked,
                    ELEVATION: this.elevationButtonEnable.checked,
                    REPORT_BLURRING: this.reportblurringButtonEnable.checked,
                    OPEN_OBLIQUE: false,
                    MEASURE: this.config.saveMeasurements || this.measureButtonEnable.checked,
                    SAVE_IMAGE: this.saveimageButtonEnable.checked,
                    IMAGE_INFORMATION: this.imageinformationButtonEnable.checked,
                    ZOOM_IN: this.zoominButtonEnable.checked,
                    ZOOM_OUT: this.zoomoutButtonEnable.checked,
                };
                return this.config;
            },

            getSrsData: function(){

                let self = this;
                let srsFinal = [];
                const spatialReferences =  "https://atlas.cyclomedia.com/spatialreferences/SpatialReferences.xml";


                dRequest(spatialReferences, {headers: {"X-Requested-With": null}})
                    .then(lang.hitch(this, function(srsData){
                        let srsJson = xml2json.toJSON(srsData);
                        dojoArray.forEach(srsJson.children, function(spatialreference, i ) {
                            let srsObj = {};
                            srsObj['Name'] = spatialreference.children[0].content;
                            srsObj['SRSName'] = spatialreference.children[1].content;
                            srsObj['SRSDimension'] = spatialreference.children[2].content;
                            srsObj['Units'] = spatialreference.children[3].content;
                            let nativeObj = {};
                            let wgsObj = {};
                            nativeObj['MinX'] = spatialreference.children[4].children[0].content;
                            nativeObj['MinY'] = spatialreference.children[4].children[1].content;
                            nativeObj['MaxX'] = spatialreference.children[4].children[2].content;
                            nativeObj['MaxY'] = spatialreference.children[4].children[3].content;
                            wgsObj['MinX'] = spatialreference.children[5].children[0].content;
                            wgsObj['MinY'] = spatialreference.children[5].children[1].content;
                            wgsObj['MaxX'] = spatialreference.children[5].children[2].content;
                            wgsObj['MaxY'] = spatialreference.children[5].children[3].content;
                            srsObj['NativeBounds'] = self.parseExtent(nativeObj);
                            srsObj['WGSBounds'] = self.parseExtent(wgsObj);
                            srsObj['Proj4'] = spatialreference.children[6].content;
                            if (spatialreference.children[7]) {
                                srsObj['"ESRICompatibleName"'] = spatialreference.children[7].content;
                            }
                            srsFinal.push(srsObj);
                        });

                        let srsDisplay = [];
                        dojoArray.forEach(srsFinal, function(spat, i){
                            let srsDisplayName = {};
                            srsDisplayName["name"] = spat.SRSName + ' - ' + spat.Name;
                            srsDisplayName["id"] = spat.SRSName;
                            srsDisplay.push(srsDisplayName);
                        });
                        srsDisplay.sort(function(a,b){
                            return parseInt(a.id.substr(5)) - parseInt(b.id.substr(5));
                        });
                        let srsStore = new Memory({data : srsDisplay});

                        let srsDropDown = new FilteringSelect({
                            id : "srsComboBox",
                            name : "SRS",
                            value : this.config.srs || '',
                            store : srsStore,
                            SearchAttr : "srs",
                            queryExpr : '*${0}*',
                            autoComplete : false,
                            placeholder : this.nls.typeSrs
                        }, "srsComboBox");
                        srsDropDown.startup();

                    }),
                    function (error) {
                        console.log(error);
                    });
                //return srsFinal;
            },

             parseExtent : function(node) {
                // Actually just an array with 4 floats: [minx, miny, maxx, maxy].
                return [
                    parseFloat(node.MinX),
                    parseFloat(node.MinY),
                    parseFloat(node.MaxX),
                    parseFloat(node.MaxY)
                ];
            }


        });
    });
