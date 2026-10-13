import React from 'react'
import { AppState, View, Image } from 'react-native'
import type { ActionId, WorkModel, SurfaceProps } from './stage-five.types'
import { TW as TWLight } from './stage-five-tokens'
import { Icon } from './stage-five-icons'
import { Box, Copy, Header, SurfaceFrame, Tap, IconSlot, ToolTile, Primary, Caution } from './stage-five-ui'
import { elapsedSeconds, formatClock } from './stage-five-model'
import { stageFiveText } from './stage-five-copy'
import { workerThemedTokensProxy } from '../../../ui/worker-dark-styles'

const TW = workerThemedTokensProxy(TWLight)
/** Stage 5 only. This is a monitor; visual timer and progress cannot write job status. */
export class StageFiveWork extends React.PureComponent<SurfaceProps<WorkModel>,{now:number;error:string|null;localBusy:boolean}> {
 state={now:Date.now(),error:null,localBusy:false}
 private timer:ReturnType<typeof setInterval>|null=null
 private subscription:ReturnType<typeof AppState.addEventListener>|null=null
 private mounted=false
 componentDidMount(){this.mounted=true;this.syncTimer();this.subscription=AppState.addEventListener('change',()=>this.syncTimer())}
 componentDidUpdate(p:SurfaceProps<WorkModel>){if(p.nowMs!==this.props.nowMs||p.model.jobId!==this.props.model.jobId)this.syncTimer()}
 componentWillUnmount(){this.mounted=false;if(this.timer)clearInterval(this.timer);this.subscription?.remove()}
 private syncTimer(){if(this.timer)clearInterval(this.timer);this.timer=null;if(!this.mounted)return;this.setState({now:Date.now()});if(this.props.nowMs!==undefined||AppState.currentState==='background')return;this.timer=setInterval(()=>this.setState({now:Date.now()}),250)}
 private run=async(id:ActionId)=>{const a=this.props.actions[id];if(!a?.enabled||this.state.localBusy||this.props.busy)return;this.setState({error:null,localBusy:true});try{await a.onPress()}catch(e){if(this.mounted)this.setState({error:e instanceof Error?e.message:stageFiveText(this.props.language,'Không thể thực hiện. Vui lòng thử lại.','Could not complete this action. Please try again.')})}finally{if(this.mounted)this.setState({localBusy:false})}}
 private tap=(id:ActionId)=>this.props.actions[id]?.enabled?()=>void this.run(id):undefined
 render(){const {model:m,referenceMode,reduceMotion,language='vi'}=this.props;const hasArrived=!!m.arrivedLabel||['arrived','inspecting','repairing','scope_change_pending','completed_by_worker','completed','closed'].includes(m.jobStatus??'');const elapsed=elapsedSeconds(this.props.nowMs??this.state.now,m.startedAtMs,m.pausedAtMs,m.pausedMs);return <SurfaceFrame testID="stage5-work">{(s,windowWidth)=><>
 <Header s={s} language={language}/>
 <Box tint s={s} height={66} style={{marginTop:6*s,paddingHorizontal:18*s,paddingVertical:14*s,borderRadius:20*s}}><View style={{flexDirection:'row',gap:14*s,alignItems:'center'}}><IconSlot name={hasArrived?'check':'locate'} s={s} size={32}/><View style={{flex:1,gap:2*s}}><Copy role="subheadline" weight="600" color="#00574D" windowWidth={windowWidth}>{stageFiveText(language,hasArrived?'Bạn đã có mặt tại địa điểm':'Chưa ghi nhận có mặt',hasArrived?'You are at the location':'Arrival not recorded')}</Copy><Copy role="caption1" color={TW.color.body} windowWidth={windowWidth}>{m.arrivedLabel||(hasArrived?stageFiveText(language,'Chưa có thời gian ghi nhận','Arrival time unavailable'):stageFiveText(language,'Chờ xác nhận từ hệ thống','Waiting for system confirmation'))}</Copy></View></View></Box>
 <Box s={s} style={{marginTop:10*s,padding:14*s}} >
 <View style={{flexDirection:'row',gap:14*s,alignItems:'center'}}>
 {m.photo||m.workart
 ?<Image source={(m.photo??m.workart)!} resizeMode="cover" style={{width:96*s,height:96*s,borderRadius:20*s,backgroundColor:'#EAF9F5'}} testID="stage5-job-art"/>
 :<View style={{width:96*s,height:96*s,borderRadius:20*s,backgroundColor:'#EAF9F5',alignItems:'center',justifyContent:'center'}}><Icon name="home" size={44*s}/></View>}
 <View style={{flex:1,gap:6*s}}>
 <Copy role="footnote" weight="600" color="#009A83" windowWidth={windowWidth}>{m.serviceCategory||'—'}</Copy>
 <Copy role="body" weight="400" lines={2} windowWidth={windowWidth}>{m.serviceTitle||stageFiveText(language,'Chưa có công việc','No active work')}</Copy>
 <View style={{flexDirection:'row',gap:6*s,alignItems:'flex-start'}}><View style={{height:18,justifyContent:'center'}}><Icon name="pin" size={16*s} color={TW.color.body}/></View><Copy role="footnote" color={TW.color.body} lines={2} style={{flex:1}} windowWidth={windowWidth}>{m.addressLine||stageFiveText(language,'Thông tin địa chỉ được bảo vệ','Address details are protected')}</Copy></View>
 </View>
 </View>
 </Box>
 <Box s={s} height={90} style={{marginTop:10*s,paddingHorizontal:16*s,paddingVertical:13*s}}>
 <View style={{flexDirection:'row',gap:12*s,alignItems:'center'}}>
 <IconSlot name="clock" s={s} size={40}/>
 <View style={{flex:1.25,gap:0}}>
 <Copy role="footnote" color={TW.color.body} windowWidth={windowWidth}>{stageFiveText(language,'Thời gian làm việc','Work time')}</Copy>
 <View testID="work-timer"><Copy role="title2" weight="600" style={{fontVariant:['tabular-nums']}} windowWidth={windowWidth}>{formatClock(elapsed)}</Copy></View>
 </View>
 <View style={{width:1,alignSelf:'stretch',marginVertical:6*s,backgroundColor:TW.color.line}}/>
 <View style={{flex:1,gap:0}}>
 <Copy role="footnote" color={TW.color.body} windowWidth={windowWidth}>{stageFiveText(language,'Bắt đầu lúc','Started at')}</Copy>
 <Copy role="title2" weight="600" style={{fontVariant:['tabular-nums']}} windowWidth={windowWidth}>{m.startedLabel||'—'}</Copy>
 </View>
 </View>
 </Box>
 <View style={{flexDirection:'row',gap:8*s,marginTop:10*s}}><ToolTile s={s} windowWidth={windowWidth} label={stageFiveText(language,'Chụp ảnh','Take photo')} icon="camera" onPress={this.tap('photo')} testID="stage5-photo"/><ToolTile s={s} windowWidth={windowWidth} label={stageFiveText(language,'Ghi chú','Notes')} icon="note" onPress={this.tap('note')} testID="stage5-note"/><View testID="worker-v5-in-progress-scope-action" style={{flex:1}}><ToolTile s={s} windowWidth={windowWidth} label={stageFiveText(language,'Báo phát sinh','Report change')} icon="warning" coral onPress={this.tap('scope')} testID="stage5-scope"/></View></View>
 <Box s={s} height={85} style={{marginTop:10*s}}><Tap s={s} label={stageFiveText(language,'Ghi chú nhanh','Quick note')} onPress={this.tap('note')} style={{padding:17*s,flexDirection:'row',alignItems:'center',gap:8*s,minHeight:84*s}}><IconSlot name="bookmark" s={s} size={44}/><View style={{flex:1,gap:4*s}}><Copy role="subheadline" weight="600" windowWidth={windowWidth}>{stageFiveText(language,'Ghi chú nhanh','Quick note')}</Copy><Copy role="caption1" color={TW.color.body} lines={2} windowWidth={windowWidth}>{m.note||stageFiveText(language,'Thêm ghi chú về tình trạng thực tế, vật tư sử dụng…','Add a note about the actual condition or materials used…')}</Copy></View></Tap></Box>
 {this.state.error??m.notice?<Copy color="#A83838" style={{marginTop:10*s}} windowWidth={windowWidth}>{this.state.error??m.notice}</Copy>:null}
 <View style={{marginTop:20*s}}><Primary s={s} windowWidth={windowWidth} language={language} label={referenceMode?stageFiveText(language,'Hoàn thành công việc','Complete work'):m.primaryLabel??stageFiveText(language,'Chuẩn bị hồ sơ hoàn tất','Prepare completion evidence')} onPress={this.tap('complete')} busy={this.state.localBusy||this.props.busy} disabled={!m.primaryEnabled} testID="stage5-primary"/></View>
 <Caution s={s} windowWidth={windowWidth}>{stageFiveText(language,'Vui lòng cập nhật đầy đủ trước khi hoàn thành.','Please update all details before completing the work.')}</Caution>
 </>}</SurfaceFrame>}
}
