import React from 'react'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Icon } from './stage-five-icons'
import type { IconName } from './stage-five-icons'
import { TW } from './stage-five-tokens'
import type { ActionId, Actions } from './stage-five.types'
import { stageFiveText, type StageFiveLanguage } from './stage-five-copy'
let gradientId = 0
export class Paint extends React.PureComponent<{primary?:boolean; tint?:boolean; background?:boolean}> {
 private id = `tw-paint-${++gradientId}`
 render(){const {primary,tint,background}=this.props;return <View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,overflow:'hidden'}}><Svg width="100%" height="100%"><Defs>{primary ? <LinearGradient id={this.id} x1="0%" y1="0%" x2="75%" y2="100%"><Stop offset="0%" stopColor="#2AD9B3"/><Stop offset="58%" stopColor="#02B49B"/><Stop offset="100%" stopColor="#009783"/></LinearGradient> : <RadialGradient id={this.id} cx={background?'52%':'8%'} cy={background?'48%':'0%'} rx="90%" ry="80%"><Stop offset="0%" stopColor={background?'#EAFBF7':tint?'#E5FFF5':'#FFFFFF'}/><Stop offset="100%" stopColor={background?'#FBFDFE':tint?'#F5FFFC':'#FAFDFE'}/></RadialGradient>}</Defs><Rect x="0" y="0" width="100%" height="100%" fill={`url(#${this.id})`}/></Svg></View>}
}
export function Copy({children,s=1,size=14,weight='400',color=TW.color.ink,style={},lines}:{children:React.ReactNode;s?:number;size?:number;weight?:'400'|'500'|'600'|'700';color?:string;style?:object;lines?:number}) {
 return <Text selectable numberOfLines={lines} style={[{fontSize:size*s,lineHeight:(size*1.33)*s,fontWeight:weight,color,position:'relative',zIndex:1},style]}>{children}</Text>
}
export function Box({children,s=1,height,style={},tint=false}:{children:React.ReactNode;s?:number;height?:number;style?:ViewStyle;tint?:boolean}) {
 return <View style={[{minHeight:height?height*s:undefined,borderRadius:22*s,borderWidth:1,borderColor:TW.color.line,backgroundColor:'#FFFFFF',overflow:'hidden',boxShadow:TW.shadow},style]}><Paint tint={tint}/>{children}</View>
}
export function IconDisc({name,s=1,size=40,primary=false,coral=false,blue=false}:{name:IconName;s?:number;size?:number;primary?:boolean;coral?:boolean;blue?:boolean}) {
 return <View style={{width:size*s,height:size*s,borderRadius:size*s/2,backgroundColor:coral?'#FFF4F1':blue?'#E7F7FF':'#DDFDF3',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>{primary?<Paint primary/>:null}<Icon name={name} size={(size>44?30:23)*s} color={primary?'#FFFFFF':coral?'#F18F83':blue?'#087ADE':'#009A83'}/></View>
}
export function Tap({children,s=1,onPress,label,disabled=false,style={},testID}:{children:React.ReactNode;s?:number;onPress?:()=>void;label:string;disabled?:boolean;style?:ViewStyle;testID?:string}) {
 return <Pressable testID={testID} onPress={onPress} disabled={disabled||!onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:disabled||!onPress}} style={({pressed})=>[{minHeight:Math.max(44,38*s),justifyContent:'center',opacity:disabled||!onPress?0.42:pressed?0.76:1,transform:[{scale:pressed?0.98:1}]},style]}>{children}</Pressable>
}
export function RoundButton({name,s=1,onPress,label,testID}:{name:IconName;s?:number;onPress?:()=>void;label:string;testID?:string}){
 return <Tap s={s} label={label} onPress={onPress} testID={testID} style={{width:Math.max(44,44*s),minHeight:Math.max(44,44*s),borderRadius:22*s,backgroundColor:'#FFFFFF',boxShadow:'0 3px 12px rgba(32,68,86,0.06)',alignItems:'center'}}><Icon name={name} color={TW.color.ink} size={21*s}/></Tap>
}
export function Header({stage,s,actions,onAction,referenceMode,subtitle,language='vi'}:{stage:4|5;s:number;actions:Actions;onAction:(id:ActionId)=>void;referenceMode?:boolean;subtitle?:string;language?:StageFiveLanguage}) {
 const title=stageFiveText(language,'Đang thực hiện công việc','Work in progress')
 const sub=subtitle??stageFiveText(language,'Bạn đã có mặt tại địa điểm. Hãy thực hiện công việc\ntheo đúng yêu cầu và cập nhật trạng thái thường xuyên.','You are at the location. Follow the job request\nand keep the work status up to date.')
 const tap=(id:ActionId)=>actions[id]?.enabled?()=>onAction(id):undefined
 return <View style={{height:146*s,paddingHorizontal:4*s}}>
  <View style={{height:50*s,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
   <RoundButton name="back" s={s} onPress={tap('back')} label={stageFiveText(language,'Quay lại','Back')} testID="stage5-back"/>
   <View style={{flexDirection:'row',gap:10*s}}><RoundButton name="phone" s={s} onPress={tap('call')} label={stageFiveText(language,'Gọi khách','Call customer')} testID="stage5-call"/><RoundButton name="chat" s={s} onPress={tap('chat')} label={stageFiveText(language,'Nhắn tin','Message')} testID="stage5-chat"/></View>
  </View>
  <View style={{position:'absolute',top:29*s,alignSelf:'center',backgroundColor:'#CFF8EF',borderRadius:20*s,paddingHorizontal:15*s,paddingVertical:4*s}}><Copy s={s} size={14} color="#006E64" weight="600">{stageFiveText(language,`Bước ${stage}/${referenceMode?'5':'11'}`,`Step ${stage}/${referenceMode?'5':'11'}`)}</Copy></View>
  <Copy s={s} size={23} weight="700" style={{textAlign:'center',marginTop:15*s,letterSpacing:-.5*s}}>{title}</Copy>
  <Copy s={s} size={14} color={TW.color.body} style={{textAlign:'center',marginTop:3*s,lineHeight:20*s}}>{sub}</Copy>
 </View>
}
export function Primary({label,icon='send',s,onPress,busy,disabled,testID,language='vi'}:{label:string;icon?:IconName;s:number;onPress?:()=>void;busy?:boolean;disabled?:boolean;testID?:string;language?:StageFiveLanguage}) {
 return <Tap s={s} label={label} onPress={onPress} disabled={disabled||busy} testID={testID} style={{height:56*s,minHeight:48,borderRadius:32*s,overflow:'hidden',boxShadow:TW.buttonShadow,backgroundColor:TW.color.teal}}><Paint primary/><View style={{flexDirection:'row',gap:12*s,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={23*s} color="#FFF"/><Copy s={s} size={17} weight="600" color="#FFF">{busy?stageFiveText(language,'Đang xử lý…','Working…'):label}</Copy></View><View style={{position:'absolute',right:26*s}}><Icon name="chevron" size={19*s} color="#FFF"/></View></Tap>
}
export function Caution({s,children}:{s:number;children:React.ReactNode}) {return <View style={{flexDirection:'row',gap:9*s,justifyContent:'center',alignItems:'center',paddingTop:15*s,paddingBottom:12*s}}><Icon name="info" size={16*s} color="#527490"/><Copy s={s} size={12} color={TW.color.body}>{children}</Copy></View>}
export function ToolTile({s,label,detail,icon,onPress,primary=false,coral=false,testID,grow=1}:{s:number;label:string;grow?:number;detail?:string|null;icon:IconName;onPress?:()=>void;primary?:boolean;coral?:boolean;testID?:string}){
 return <Box s={s} style={{flex:grow,borderRadius:20*s}}><Tap s={s} label={label} onPress={onPress} testID={testID} style={{alignItems:'center',paddingVertical:13*s,paddingHorizontal:4*s,minHeight:100*s,gap:5*s}}><IconDisc name={icon} s={s} primary={primary} coral={coral}/><Copy s={s} size={12} color={TW.color.body} style={{textAlign:'center',lineHeight:16*s}}>{label}</Copy>{detail?<Copy s={s} size={11} color={TW.color.body} style={{textAlign:'center',marginTop:-3*s}}>{detail}</Copy>:null}</Tap></Box>
}
export class Pulse extends React.PureComponent<{children:React.ReactNode;reduceMotion?:boolean}> {
 private value=new Animated.Value(1)
 private animation:Animated.CompositeAnimation|null=null
 componentDidMount(){this.start()}
 componentDidUpdate(p:Readonly<{children:React.ReactNode;reduceMotion?:boolean}>){if(p.reduceMotion!==this.props.reduceMotion)this.start()}
 componentWillUnmount(){this.animation?.stop()}
 private start(){this.animation?.stop();this.value.setValue(1);if(this.props.reduceMotion)return;this.animation=Animated.loop(Animated.sequence([Animated.timing(this.value,{toValue:.55,duration:1300,easing:Easing.inOut(Easing.cubic),useNativeDriver:true}),Animated.timing(this.value,{toValue:1,duration:1300,easing:Easing.inOut(Easing.cubic),useNativeDriver:true})]));this.animation.start()}
 render(){return <Animated.View style={{opacity:this.value}}>{this.props.children}</Animated.View>}
}
export class SurfaceFrame extends React.Component<{children:(s:number)=>React.ReactNode;testID:string},{width:number}> {
 state={width:446}
 render(){const s=Math.max(.68,Math.min(1.25,this.state.width/446));return <View testID={this.props.testID} onLayout={e=>{const w=e.nativeEvent.layout.width;if(w>0&&Math.abs(w-this.state.width)>.5)this.setState({width:w})}} style={{width:'100%',alignSelf:'center',backgroundColor:TW.color.canvas,minHeight:894*s,overflow:'hidden'}}><Paint background/><View style={{paddingHorizontal:12*s,paddingTop:2*s}}>{this.props.children(s)}</View></View>}
}
