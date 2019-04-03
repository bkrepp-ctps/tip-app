proj4.defs('EPSG:26986', '+proj=lcc +lat_1=42.68333333333333 +lat_2=41.71666666666667 +lat_0=41 +lon_0=-71.5 +x_0=200000 +y_0=750000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs');

var wfsServerRoot = location.protocol + '//' + location.hostname + ':8080/geoserver/wfs';
// Global "database" of JSON returned from WFS requests
var DATA = {};
 
$(document).ready(function() {
    // Enable accessible tabs
     $('.tabs').accessibleTabs({tabhead:'h2'});
    // Load data
    var projectsURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_projects_view&outputformat=json';
    var eval_criteriaURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_evaluation_criteria&outputformat=json';
    var bridge_componentURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_bridge_component_view&outputformat=json';
    var bridge_dataURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_bridge_data&outputformat=json';
    var proj_townURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_project_town_view&outputformat=json';
    var proj_proponentURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_project_proponent_view&outputformat=json';
    var fundingURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_funding_view&outputformat=json';
    var amendmentURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_project_amendment_view&outputformat=json';
    var city_town_lutURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_city_town_lookup&outputformat=json';
    var contactsURL = wfsServerRoot + '/?service=wfs&version=1.1.0&request=getfeature&typename=tip_tabular:tip_contacts&outputformat=json';
    
    var getJson = function(url) {
        return $.get(url, null, 'json');
    };
        
    $.when(getJson(projectsURL), 
           getJson(eval_criteriaURL), 
           getJson(bridge_componentURL),
           getJson(bridge_dataURL), 
           getJson(proj_townURL), 
           getJson(proj_proponentURL),
           getJson(fundingURL), 
           getJson(amendmentURL), 
           getJson(city_town_lutURL), 
           getJson(contactsURL)
    ).done(function(projects, eval_criteria, bridge_component, bridge_data, proj_town, 
                    proj_proponent, funding, amendment, city_town_lut, contacts, proj_cat) {
        var ok = _.every(arguments, function(arg) { return arg[1] === "success"; });
        if (ok === false) {
            alert("One or more WFS requests failed. Exiting application.");
            return;         
        }
        DATA.projects = projects[0].features.sort(function(a,b) { return (+a.properties.tip_id) - (+b.properties.tip_id) });
        DATA.eval_criteria = eval_criteria[0].features;
        DATA.bridge_component = bridge_component[0].features;
        DATA.bridge_data = bridge_data[0].features;
        DATA.proj_town = proj_town[0].features;
        DATA.proj_proponent = proj_proponent[0].features;
        DATA.funding = funding[0].features;
        DATA.amendment = amendment[0].features;
        DATA.city_town_lut = city_town_lut[0].features;
        DATA.contacts = contacts[0].features;
        initApp(DATA);
    });
});	

// Global Google Maps map object
var map = {};

function initApp(data) {
    var tip_id = getURLParameter('tip_id');
    var p = _.find(DATA.projects, function(project) { return project.properties['tip_id'] === tip_id; });
    if (p.length === 0) {
        alert('failed to find project with TIP ID ' + tip_id + ' in projects JSON.');
        return;
    }
    displayTabularData(p);
    
    var regionCenterLat = 42.345111165; 
    var regionCenterLng = -71.124736685;
    var zoomLev = 10;
    var lat = regionCenterLat;
    var lng = regionCenterLng;
    
    var mapOptions = {
        center: new google.maps.LatLng(lat, lng),
        zoom: zoomLev,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControlOptions: {'style': google.maps.MapTypeControlStyle.DROPDOWN_MENU},
        panControl: false,
        streetViewControl: false,
        zoomControlOptions: {'style': 'SMALL'},
        scaleControl: true,
        overviewMapControl: false
    };
    
    map = new google.maps.Map(document.getElementById("map"), mapOptions);
    google.maps.event.addListener(map, "bounds_changed", function boundsChangedHandler(e) { });
    // Un petit hacque to get the map's "bounds_changed" event to fire.
    // Believe it or not: When a Google Maps map object is created, its bounding
    // box is undefined (!!). Thus calling map.getBounds on a newly created map
    // will raise an error. We are compelled to force a "bounds_changed" event to fire.
    // Larry and Sergey: How did you let this one get through the cracks??
    map.setCenter(new google.maps.LatLng(lat + 0.000000001, lng + 0.000000001));
    
    if (p.properties['has_geo'] === -1) {
        // Project has geographic feature
        var sQuery = 'cql_filter=tip_id=' + tip_id;
        var sUrl = wfsServerRoot + '?service=wfs&version=1.1.0&request=getfeature&typename=cert_act:tip_spatial_line_project_4app&srsName=EPSG:4326&outputformat=json&' + sQuery;
        $.ajax({ url		:   sUrl,
                 type		:   'GET',
                 dataType	:   'json',
                 success	:   function (data, textStatus, jqXHR) {
                                    var gmPolyline = {}; lineFeature = {}, aFeatCoords = [], point = {}, aAllPoints = [], bbox = [], googleBounds = {};
                                    var i, j;
                                    lineFeature = data.features[0];
                                    if (lineFeature.geometry.type === 'MultiLineString') {
                                        console.log('Rendering MultiLintString feature with TIP ID  ' + lineFeature.properties['tip_id']);
                                        aFeatCoords = lineFeature.geometry.coordinates;
                                        for (i = 0; i < aFeatCoords.length; i++) {
                                            aAllPoints = [];
                                            for (j = 0; j < aFeatCoords[i].length; j++) {
                                                aCoord = aFeatCoords[i][j];
                                                point = new google.maps.LatLng({ 'lat': aCoord[1], 'lng': aCoord[0] });
                                                aAllPoints.push(point);
                                            } // for j in aFeatCoords[i]
                                            gmPolyline = new google.maps.Polyline({ path            : aAllPoints,
                                                                                    map             : map,
                                                                                    strokeColor     : projCategoryToColor(p),
                                                                                    strokeOpacity   : 0.7,
                                                                                    strokeWeight    : 6 });
                                        } // for i in aFeatureCoords.length
                                    } else if (lineFeature.geometry.type === 'LineString') {
                                        console.log('Rendering LintString feature with TIP ID  ' + lineFeature.properties['tip_id']);
                                        aFeatCoords = lineFeature.geometry.coordinates;
                                        for (i = 0; i < aFeatCoords.length; i++ ) {
                                            aCoord = aFeatCoords[i];
                                            point = new google.maps.LatLng({ 'lat': aCoord[1], 'lng': aCoord[0] });
                                            aAllPoints.push(point);
                                            gmPolyline = new google.maps.Polyline({ path            : aAllPoints,
                                                                                    map             : map,
                                                                                    strokeColor     : projCategoryToColor(p),
                                                                                    strokeOpacity   : 0.7,
                                                                                    strokeWeight    : 6 });
                                        }
                                    } else {
                                        console.log('Project with TIP ID ' + tip_id + ': has unrecognized geometry type: ' + lineFeature.geometry.type);
                                        return;
                                    }
                                    bbox = turf.bbox(lineFeature);
                                    // Return value of turf.bbox() has the form: [minX, minY, maxX, maxY]
                                    // Morph this into a form Google Maps can digest
                                    googleBounds = new google.maps.LatLngBounds();
                                    googleBounds.extend({ lat : bbox[1], lng : bbox[0] });
                                    googleBounds.extend({ lat : bbox[3], lng : bbox[2] });
                                    map.fitBounds(googleBounds);
                                }, // success handler
                 error		: 	function (qXHR, textStatus, errorThrown ) {
                                    alert('WFS request in initApp failed.\n' + 'Status: ' + textStatus + '\n' + 'Error:  ' + errorThrown);
                                } // error handler
        }); // $.ajax call - WFS request
    } // if (p.properties['has_geo'] === -1)
} // initApp()


// Return the value of the parameter named 'sParam' from the window's URL
function getURLParameter(sParam) {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    var i;
    for (i = 0; i < sURLVariables.length; i++ ) {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            return sParameterName[1];
        }
    }
    // If we get here, parameter not found
    return('');
} // gtetURLParameter()

// Given a tip_projects record, return the color in which to symbolize the project based on the project's 'category'
function projCategoryToColor(project) {
    var pcat = project.properties['proj_cat'];
    var retval;
    switch(pcat) {
    case 'Arterial and Intersection':
        retval = '#e661ac';
        break;
    case 'Bicycle and Pedestrian':
        retval = '#fd7567';
        break;
    case 'Bridge':
        retval = '#6991fd';
        break;
    case 'Major Highway':
        retval = '#ff9900';
        break;
    case 'Transit': 
        retval = '#00e64d';
        break;
    default:
        retval = '#050505';
        break;
    }
    return retval;
} // projTypeToColor

// Dispaly tabular data for the project whose tip_project record has been passed as parameter 'p'
function displayTabularData(p) {
/*
    var p = _.find(DATA.projects, function(project) { return project.properties['tip_id'] === tip_id; });
    if (p.length === 0) {
        alert('failed to find project with TIP ID ' + tip_id + ' in projects JSON.');
        return;
    }
*/
    $('#project_detail_header').html('TIP Project ' + p.properties['tip_id'] + ' : ' + p.properties['proj_name']);
  
    $('.proj_data').empty();  
    // Overview tab
    $('#tip_id').html(p.properties['tip_id']);
    $('#projis').html(p.properties['projis']);
    $('#proj_name').html(p.properties['proj_name']);
    $('#proj_desc').html(p.properties['proj_desc']);
    $('#proj_cat').html(p.properties['proj_cat']);
    $('#stip_prog').html(p.properties['stip_proj']);
    $('#proj_len').html(p.properties['proj_len']);
    $('#exist_lane_mi').html(p.properties['exist_lane_mi']);
    $('#lane_mi_added_improved').html(p.properties['lane_mi_added_improved']);
    $('#tot_lane_mi').html(p.properties['tot_lane_mi']);
    $('#sidewalk_mi').html(p.properties['sidewalk_mi']);
    $('#sidewalk_mi_improved').html(p.properties['sidewalk_mi_improved']);
    $('#on_road_bike_fac_mi').html(p.properties['on_road_bike_fac_mi']); 
    $('#off_road_bike_fac_mi').html(p.properties['off_road_bike_fac_mi']);
    $('#fdr_on_file').html(p.properties['fdr_on_file'] === -1 ? 'Yes' : 'No');
    $('#prc_approved').html(p.properties['prc_approved'] === -1 ? 'Yes' : 'No');
    $('#prc_year').html(p.properties['prc_year']); 
    $('#design_stat').html(p.properties['design_stat']); 
    $('#design_stat_date').html(p.properties['design_stat_date']);  // Will this require special processing?
    $('#adds_capacity').html(p.properties['adds_capacity'] === -1 ? 'Yes' : 'No');
    $('#lrtp_project').html(p.properties['lrtp_project'] === -1 ? 'Yes' : 'No');
    $('#cur_cost_est').html(p.properties['cur_cost_est']); 
    $('#proj_update_date').html(p.properties['proj_update_date']);  // Will this require special processing?
    $('#funding_stat').html(p.properties['funding_stat']);
    $('#mpo_invest_prog').html(p.properties['mpo_invest_prog']);
    $('#lrtp_identified_need').html(p.properties['lrtp_identified_need']);
    $('#amt_programmed').html(p.properties['amt_programmed']);
    $('#mun_priority').html(p.properties['mun_priority'] === -1 ? 'Yes' : 'No');
    
    // Prep for retreiving project evaluation criteria
    var ctps_id = p.properties['ctps_id'];
    var queryString = 'tip_evaluation_criteria.' + ctps_id;
    var predicate = function(ec_record) { return ec_record.id === queryString };
    // N.B. The relation between the tip_projects table and the tip_evaluation_criteria table is 1-to-1.
    var ec = _.find(DATA.eval_criteria,predicate);
    
    // Evaluation criteria - safety
    $('#num_fatal_crashes').html(ec.properties['num_fatal_crashes']);
    $('#num_injury_crashes').html(ec.properties['num_injury_crashes']);
    $('#num_property_crashes').html(ec.properties['num_property_crashes']);
    $('#num_bicycle_crashes').html(ec.properties['num_bicycle_crashes']);
    $('#num_ped_crashes').html(ec.properties['num_ped_crashes']);
    $('#num_total_crashes').html(ec.properties['num_total_crashes']);
    $('#epdo').html(ec.properties['epdo']);
    $('#crash_severity_val_scor').html(ec.properties['crash_severity_val_scor']);
    $('#hsip_cluster').html(ec.properties['crash_severity_val_scor']);
    $('#truck_crashes').html(ec.properties['truck_crashes']);
    $('#crash_years').html(ec.properties['crash_years']);
    $('#crash_rate').html(ec.properties['crash_rate']);
    $('#intersec_type').html(ec.properties['intersec_type']);
    $('#urb_fed_func_class').html(ec.properties['urb_fed_func_class']);
    $('#crash_score_corr').html(ec.properties['crash_score_corr']);
    $('#total_adt').html(ec.properties['total_adt']);
    $('#truck_adt').html(ec.properties['truck_ad']);
    $('#exist_ped_facilities').html(ec.properties['exist_ped_facilities']);
    $('#exist_ped_safety_issues').html(ec.properties['exist_ped_safety_issues']);
    $('#exist_ped_use').html(ec.properties['exist_ped_use']);
    $('#exist_ped_use_desc').html(ec.properties['#exist_ped_use_desc']);
    $('#desired_ped_use').html(ec.properties['#desired_ped_us']);
    $('#desired_ped_use_desc').html(ec.properties['desired_ped_use_desc']);
    $('#prop_ped_countermeas').html(ec.properties['prop_ped_countermea']);
    $('#ped_countermeas_eval').html(ec.properties['ped_countermeas_eval']);
    $('#ped_countermeas_score').html(ec.properties['ped_countermeas_score']);
    $('#ped_hsip').html(ec.properties['ped_hsip'] === -1 ? 'Yes' : 'No');
    $('#ped_hsip_bonus_score').html(ec.properties['ped_hsip_bonus_score']);
    $('#ex_bike_facilities').html(ec.properties['ex_bike_facilities']);
    $('#ex_bike_facilities_desc').html(ec.properties['ex_bike_facilities_desc']);
    $('#ex_bike_safety_issues').html(ec.properties['ex_bike_safety_issues']);
    $('#ex_bike_use').html(ec.properties['ex_bike_use']);
    $('#ex_bike_use_desc').html(ec.properties['ex_bike_use_desc']);
    $('#desired_bike_use').html(ec.properties['desired_bike_use']);
    $('#desired_bike_use_desc').html(ec.properties['desired_bike_use_desc']);
    $('#prop_bike_bike_facilities').html(ec.properties['prop_bike_bike_facilities']);
    $('#prop_bike_bike_fac_desc').html(ec.properties['prop_bike_bike_fac_desc']);
    $('#bike_countermeas_eval').html(ec.properties['bike_countermeas_eval']);
    $('#bike_countermeas_score').html(ec.properties['bike_countermeas_scor']);
    $('#bike_hsip').html(ec.properties['bike_hsip'] === -1 ? 'Yes' : 'No');
    $('#bike_hsip_bonus_score').html(ec.properties['bike_hsip_bonus_score']);
    $('#max_cluster_epdo').html(ec.properties['max_cluster_epdo']);
    $('#truck_rdwy_deficiency').html(ec.properties['truck_rdwy_deficiency']);
    $('#prop_truck_countermeas').html(ec.properties['prop_truck_countermeas']);
    $('#truck_countermeas_eval').html(ec.properties['truck_countermeas_eval']);
    $('#truck_countermeas_eval').html(ec.properties['truck_countermeas_eval']);
    $('#trk_safety_bonus_scor').html(ec.properties['trk_safety_bonus_scor']);
    $('#at_grade_rr_xing').html(ec.properties['at_grade_rr_xing'] === -1 ? 'Yes' : 'No');
    $('#rr_xing_improve').html(ec.properties['rr_xing_improve']);
    $('#rr_xing_improve').html(ec.properties['rr_xing_improve']);
    $('#rr_xing_improve_score').html(ec.properties['rr_xing_improve_score']);
    $('#overall_safety_score').html(ec.properties['overall_safety_score']);
 
    // Evaluation criteria - system preservation
    $('#brdg_imprv_in_proj').html(ec.properties['brdg_imprv_in_proj']  === -1 ? 'Yes' : 'No');
    $('#imprv_substd_brdg_scor').html(ec.properties['imprv_substd_brdg_scor']);
    $('#iri_value').html(ec.properties['iri_value']);
    $('#iri_rating').html(ec.properties['iri_rating']);
    $('#iri_year').html(ec.properties['iri_year']);
    $('#exist_pavement_cond_desc').html(ec.properties['exist_pavement_cond_desc']);
    $('#imprv_substd_pvmt_scor').html(ec.properties['imprv_substd_pvmt_scor']);
    $('#total_signals_proj_area').html(ec.properties['total_signals_proj_area']);
    $('#signals_to_be_improved').html(ec.properties['signals_to_be_improved']);
    $('#signal_desc').html(ec.properties['signal_desc']);
    $('#planned_signal_improv').html(ec.properties['planned_signal_improv']);
    $('#imprv_substd_sig_scor').html(ec.properties['imprv_substd_sig_scor']);
    $('#in_hurricane_evac_zn').html(ec.properties['in_hurricane_evac_zn']  === -1 ? 'Yes' : 'No');
    $('#imprv_evac_rte').html(ec.properties['imprv_evac_rte']  === -1 ? 'Yes' : 'No');
    $('#imprv_evac_rte_score').html(ec.properties['imprv_evac_rte_score']);
    $('#in_flood_zone').html(ec.properties['in_flood_zone']  === -1 ? 'Yes' : 'No');
    $('#flood_probs_desc').html(ec.properties['flood_probs_desc']);
    $('#addr_flooding_score').html(ec.properties['addr_flooding_score']);
    $('#near_emerg_support_fac').html(ec.properties['near_emerg_support_fac']  === -1 ? 'Yes' : 'No');
    $('#emerg_suppt_fac_names').html(ec.properties['emerg_suppt_fac_names']);
    $('#imprv_emerg_supp_acc').html(ec.properties['imprv_emerg_supp_acc']  === -1 ? 'Yes' : 'No');
    $('#imprv_emerg_supp_desc').html(ec.properties['imprv_emerg_supp_desc']);
    $('#imprv_emerg_supp_score').html(ec.properties['imprv_emerg_supp_desc']);
    $('#trnst_asset_to_good_repair').html(ec.properties['trnst_asset_to_good_repair']  === -1 ? 'Yes' : 'No');
    $('#trnst_asset_imprv_desc').html(ec.properties['trnst_asset_imprv_desc']);
    $('#addr_asset_mgt_plan').html(ec.properties['addr_asset_mgt_plan']  === -1 ? 'Yes' : 'No');
    $('#imprv_transit_asset_scor').html(ec.properties['imprv_transit_asset_scor']);
    $('#ex_sidewalk_cond_rat').html(ec.properties['ex_sidewalk_cond_rat']);
    $('#ex_sidewalk_cond_char').html(ec.properties['ex_sidewalk_cond_char']);
    $('#prop_sidewalk_imprv').html(ec.properties['prop_sidewalk_imprv']);
    $('#imprv_substd_sdwlk_scor').html(ec.properties['imprv_substd_sdwlk_scor']);
    $('#to_seismic_design_std').html(ec.properties['to_seismic_design_std']  === -1 ? 'Yes' : 'No');
    $('#seismic_std_issues').html(ec.properties['seismic_std_issues']);
    $('#addr_crit_infrastruc').html(ec.properties['addr_crit_infrastruc']  === -1 ? 'Yes' : 'No');
    $('#addr_crit_infras_steps').html(ec.properties['addr_crit_infras_steps']);
    $('#implem_haz_clim_plan').html(ec.properties['implem_haz_clim_plan']  === -1 ? 'Yes' : 'No');
    $('#haz_clim_plan_desc').html(ec.properties['haz_clim_plan_desc']);
    $('#imprv_resp_xtrm_cnd_scor').html(ec.properties['imprv_resp_xtrm_cnd_scor']);
    $('#protects_frt_net_elem').html(ec.properties['protects_frt_net_elem']  === -1 ? 'Yes' : 'No');
    $('#overall_sys_pres_score').html(ec.properties['overall_sys_pres_score']);

    // Evaluation criteria - capacity management
    $('#mbta_bus_rtes').html(ec.properties['mbta_bus_rtes']);
    $('#other_transit_rtes').html(ec.properties['other_transit_rtes']);
    $('#daily_transit_runs').html(ec.properties['daily_transit_runs']);
    $('#nobld_signal_dealy').html(ec.properties['nobld_signal_dealy']);
    $('#bld_signal_dealy').html(ec.properties['nobld_signal_dealy']);
    $('#chg_signal_dealy').html(ec.properties['chg_signal_dealy']);
    $('#chg_transit_veh_delay').html(ec.properties['chg_transit_veh_delay']);
    $('#transit_delay_base_scor').html(ec.properties['transit_delay_base_scor']);
    $('#imprv_key_bus_rtes').html(ec.properties['imprv_key_bus_rtes']  === -1 ? 'Yes' : 'No');
    $('#transt_delay_bonus_scor').html(ec.properties['transt_delay_bonus_scor']);
    $('#adds_new_sidewalks').html(ec.properties['adds_new_sidewalks']  === -1 ? 'Yes' : 'No');
    $('#imprv_ada_access').html(ec.properties['imprv_ada_access']  === -1 ? 'Yes' : 'No');
    $('#id_ped_net_gap').html(ec.properties['id_ped_net_gap']  === -1 ? 'Yes' : 'No');
    $('#ped_net_gap_descr').html(ec.properties['ped_net_gap_descr']);
    $('#imprv_ped_net_score').html(ec.properties['imprv_ped_net_score']);
    $('#id_bike_net_gap').html(ec.properties['id_bike_net_gap']  === -1 ? 'Yes' : 'No');
    $('#bike_net_gap_descr').html(ec.properties['bike_net_gap_descr']);
    $('#imprv_bike_net_score').html(ec.properties['imprv_bike_net_score']);
    $('#trnst_conn_imprv_desc').html(ec.properties['trnst_conn_imprv_desc']);
    $('#trnst_conn_imprv_assmt').html(ec.properties['trnst_conn_imprv_assmt']);
    $('#intrmodl_fac_use_assmt').html(ec.properties['intrmodl_fac_use_assmt']);
    $('#intrmodl_fac_use_data').html(ec.properties['intrmodl_fac_use_data']);
    $('#imprv_intrmodl_conn_scor').html(ec.properties['imprv_intrmodl_conn_scor']);
    $('#trk_rdwy_cond_desc').html(ec.properties['trk_rdwy_cond_desc']);
    $('#trk_deficiencies_desc').html(ec.properties['trk_deficiencies_desc']);
    $('#trk_mvmt_improv_asssmt').html(ec.properties['trk_mvmt_improv_asssmt']);
    $('#bottleneck_loc').html(ec.properties['bottleneck_loc']  === -1 ? 'Yes' : 'No');
    $('#improv_trk_mvmt_scor').html(ec.properties['improv_trk_mvmt_scor']);
    $('#veh_delay_chg').html(ec.properties['veh_delay_chg']);
    $('#reduc_veh_cong_scor').html(ec.properties['reduc_veh_cong_scor']);
    $('#overall_cp_mgmt_score').html(ec.properties['overall_cp_mgmt_score']);

    // Evaluation criteria - clean air / clean communities
    $('#in_green_community').html(ec.properties['in_green_community']  === -1 ? 'Yes' : 'No');
    $('#green_community_scor').html(ec.properties['green_community_scor']);
    $('#co2_tons_reduced').html(ec.properties['co2_tons_reduced']);
    $('#reduces_co2_score').html(ec.properties['reduces_co2_score']);
    $('#emissions_change').html(ec.properties['emissions_change']);
    $('#reduc_emissions_scor').html(ec.properties['reduc_emissions_scor']);
    $('#strmwtr_best_pract').html(ec.properties['strmwtr_best_pract']  === -1 ? 'Yes' : 'No');
    $('#strmwtr_best_pract_desc').html(ec.properties['strmwtr_best_pract_desc']);
    $('#cult_res_os_improv').html(ec.properties['cult_res_os_improv']  === -1 ? 'Yes' : 'No');
    $('#cult_res_os_improv_desc').html(ec.properties['cult_res_os_improv_desc']);
    $('#wetlands_res_improv').html(ec.properties['wetlands_res_improv']  === -1 ? 'Yes' : 'No');
    $('#wetlands_res_improv_desc').html(ec.properties['wetlands_res_improv_desc']);
    $('#wildlife_area_imprv').html(ec.properties['wildlife_area_imprv']);
    $('#wildlife_area_imprv_desc').html(ec.properties['wildlife_area_imprv_desc']);
    $('#addr_env_impct_score').html(ec.properties['addr_env_impct_score']);
    $('#overall_cln_air_score').html(ec.properties['overall_cln_air_score']);

    // Evaluation criieria - transportation equity
    $('#min_pop_pct').html(ec.properties['min_pop_pct']);
    $('#min_pop_count').html(ec.properties['min_pop_count']);
    $('#min_pop_concent').html(ec.properties['min_pop_concent']);
    $('#min_pop_score').html(ec.properties['min_pop_score']);
    $('#low_inc_hh_pct').html(ec.properties['low_inc_hh_pct']);
    $('#low_inc_hh_count').html(ec.properties['low_inc_hh_count']);
    $('#low_inc_hh_count').html(ec.properties['low_inc_hh_count']);
    $('#low_inc_hh_score').html(ec.properties['low_inc_hh_score']);
    $('#lep_pop_pct').html(ec.properties['lep_pop_pct']);
    $('#lep_pop_count').html(ec.properties['lep_pop_count']);
    $('#lep_pop_concent').html(ec.properties['lep_pop_concent']);
    $('#lep_pop_score').html(ec.properties['lep_pop_score']);
    $('#elderly_pop_pct').html(ec.properties['elderly_pop_pct']);
    $('#elderly_pop_count').html(ec.properties['elderly_pop_count']);
    $('#elderly_pop_concent').html(ec.properties['elderly_pop_concent']);
    $('#elderly_pop_score').html(ec.properties['elderly_pop_score']);
    $('#zero_veh_hh_pct').html(ec.properties['zero_veh_hh_pct']);
    $('#zero_veh_hh_count').html(ec.properties['zero_veh_hh_count']);
    $('#zero_veh_hh_concent').html(ec.properties['zero_veh_hh_concent']);
    $('#zero_veh_hh_score').html(ec.properties['zero_veh_hh_score']);
    $('#disabled_pop_pct').html(ec.properties['disabled_pop_pct']);
    $('#disabled_pop_count').html(ec.properties['disabled_pop_count']);
    $('#disabled_pop_concent').html(ec.properties['disabled_pop_concent']);
    $('#disabled_pop_score').html(ec.properties['disabled_pop_score']);
    $('#creates_ttl6_ej_burden').html(ec.properties['creates_ttl6_ej_burden']  === -1 ? 'Yes' : 'No');
    $('#creates_burden_score').html(ec.properties['creates_burden_score']);
    $('#overall_equity_score').html(ec.properties['overall_equity_score']);
    
    // Evaluation critieria - economic vitality
    $('#near_targ_dev_site').html(ec.properties['near_targ_dev_site']  === -1 ? 'Yes' : 'No');
    $('#targ_dev_site_name').html(ec.properties['targ_dev_site_name']);
    $('#targ_dev_site_acc_imprv').html(ec.properties['targ_dev_site_acc_imprv']);
    $('#td_transit_access_chg').html(ec.properties['td_transit_access_chg'] );
    $('#td_bike_access_chg').html(ec.properties['td_bike_access_chg']  === -1 ? 'Yes' : 'No');
    $('#td_ped_access_chg').html(ec.properties['td_ped_access_chg']  === -1 ? 'Yes' : 'No');
    $('#td_road_access_chg').html(ec.properties['td_road_access_chg']  === -1 ? 'Yes' : 'No');
    $('#serves_targ_dev_score').html(ec.properties['serves_targ_dev_score']);
    $('#conc_dev_area').html(ec.properties['conc_dev_area']  === -1 ? 'Yes' : 'No');
    $('#conc_dev_proj_overlap').html(ec.properties['conc_dev_proj_overlap']);
    $('#smart_growth_zoning').html(ec.properties['smart_growth_zoning']  === -1 ? 'Yes' : 'No');
    $('#has_commerc_dist_org').html(ec.properties['has_commerc_dist_org']  === -1 ? 'Yes' : 'No');
    $('#commerc_dist_org_name').html(ec.properties['commerc_dist_org_name']);
    $('#consist_metro_fut_scor').html(ec.properties['consist_metro_fut_scor']);
    $('#improv_acc_hi_econ_act').html(ec.properties['improv_acc_hi_econ_act']  === -1 ? 'Yes' : 'No');
    $('#improv_act_ctr_transit_acc').html(ec.properties['improv_act_ctr_transit_acc']  === -1 ? 'Yes' : 'No');
    $('#improv_act_ctr_ped_acc').html(ec.properties['improv_act_ctr_ped_acc']  === -1 ? 'Yes' : 'No');
    $('#improv_act_ctr_bike_acc').html(ec.properties['improv_act_ctr_bike_acc']  === -1 ? 'Yes' : 'No');
    $('#improv_act_ctr_truck_acc').html(ec.properties['improv_act_ctr_truck_acc']  === -1 ? 'Yes' : 'No');
    $('#improv_act_ctr_truck_acc').html(ec.properties['improv_act_ctr_truck_acc']);
    $('#non_tip_invest_type').html(ec.properties['non_tip_invest_type']);
    $('#non_tip_invest_pct').html(ec.properties['non_tip_invest_pct']);
    $('#lev_othr_invest_score').html(ec.properties['lev_othr_invest_score']);
    $('#overall_econ_vital_score').html(ec.properties['#overall_econ_vital_score']);
    $('#overall_eval_score').html(ec.properties['overall_eval_score']);
} // displayTabularData()